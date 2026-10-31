// POST /api/import-mail-list - Import from CRU_Direct-Mail-List_Master_v2
// Goes to mail_drops, NOT clients
// Arm A = Broward + Palm Beach (recent inspection findings)
// Arm B = Miami Shores (location-based)
// Skip "Remove – current client", flag "Jonathan to decide"

interface Env {
  DB: D1Database;
  ADMIN_EMAILS: string;
}

interface Data {
  userEmail: string;
}

function isAdmin(env: Env, email: string): boolean {
  const adminList = (env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
  return adminList.includes(email.toLowerCase());
}

// Determine arm based on county/location
function determineArm(county: string, city: string): 'A_violation_business' | 'B_new_address_per_location' {
  const loc = (county + ' ' + city).toLowerCase();

  // Arm A = Broward + Palm Beach (inspection findings)
  if (loc.includes('broward') || loc.includes('palm beach')) {
    return 'A_violation_business';
  }

  // Arm B = Miami Shores (location-based)
  if (loc.includes('miami') || loc.includes('dade')) {
    return 'B_new_address_per_location';
  }

  // Default to Arm B if unclear
  return 'B_new_address_per_location';
}

export const onRequestPost: PagesFunction<Env, string, Data> = async (context) => {
  const { env, request, data } = context;
  const url = new URL(request.url);
  const previewOnly = url.searchParams.get('preview') === 'true';

  // Server-side admin check
  if (!isAdmin(env, data.userEmail)) {
    await env.DB.prepare(`
      INSERT INTO audit_log (actor, action, entity, payload)
      VALUES (?, ?, ?, ?)
    `).bind(data.userEmail, 'import_mail_list_denied', 'mail_drops', JSON.stringify({ reason: 'Not an admin' })).run();

    return new Response(JSON.stringify({ error: 'Only admins can import' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json() as { rows: Record<string, string>[] };
    const { rows } = body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: 'No data provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const issues: Array<{ row: number; field: string; message: string }> = [];
    const flagged: Array<{ row: number; company: string; reason: string }> = [];
    const skipped: Array<{ row: number; company: string; reason: string }> = [];
    const validRows: Array<{ rowNum: number; data: Record<string, string>; arm: string }> = [];

    const armCounts = { A: 0, B: 0 };

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const rowNum = idx + 2;

      const status = (row.status || row.Status || '').toLowerCase();
      const company = row.company || row.Company || row['Business Name'] || row.business_name || '';
      const county = row.county || row.County || '';
      const city = row.city || row.City || '';

      // Skip "Remove – current client"
      if (status.includes('remove') && status.includes('current client')) {
        skipped.push({ row: rowNum, company, reason: 'Remove – current client' });
        continue;
      }

      // Flag "Jonathan to decide"
      if (status.includes('jonathan') || status.includes('decide')) {
        flagged.push({ row: rowNum, company, reason: 'Jonathan to decide' });
      }

      if (!company.trim()) {
        issues.push({ row: rowNum, field: 'company', message: 'Business name required' });
        continue;
      }

      const arm = determineArm(county, city);
      if (arm === 'A_violation_business') {
        armCounts.A++;
      } else {
        armCounts.B++;
      }

      validRows.push({ rowNum, data: row, arm });
    }

    const summary = {
      total: rows.length,
      valid: validRows.length,
      skipped_current_clients: skipped.length,
      flagged_for_jonathan: flagged.length,
      invalid: issues.length,
      arm_a_inspection_findings: armCounts.A,
      arm_b_location_based: armCounts.B,
      note: 'Arms differ by geography: Arm A = Broward + Palm Beach, Arm B = Miami-Dade'
    };

    if (previewOnly) {
      return new Response(JSON.stringify({
        success: true,
        preview: true,
        total: rows.length,
        valid: validRows.length,
        issues: issues.slice(0, 50),
        skipped: skipped.slice(0, 20),
        flagged: flagged,
        summary
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get or create Direct Mail campaign
    let campaign = await env.DB.prepare(`SELECT id FROM campaigns WHERE name LIKE '%Direct Mail%' LIMIT 1`).first();
    if (!campaign) {
      await env.DB.prepare(`
        INSERT INTO campaigns (name, channel, status, round, description)
        VALUES ('Direct Mail Pilot', 'direct_mail', 'active', 1, 'A/B test: Arm A (inspection findings) vs Arm B (location-based). Arms also differ by geography.')
      `).run();
      campaign = await env.DB.prepare(`SELECT id FROM campaigns WHERE name = 'Direct Mail Pilot'`).first();
    }

    let inserted = 0;
    for (const { data: row, arm } of validRows) {
      const company = row.company || row.Company || row['Business Name'] || row.business_name || '';
      const address = row.address || row.Address || '';
      const county = row.county || row.County || '';
      const trackingCode = row.promo_code || row['Promo code'] || row['Promo Code'] || row.tracking_code || '';
      const status = row.status || row.Status || '';

      const reviewFlag = (status.toLowerCase().includes('jonathan') || status.toLowerCase().includes('decide'))
        ? 'Jonathan to decide'
        : null;

      await env.DB.prepare(`
        INSERT INTO mail_drops (campaign_id, arm, business_name, address, county, tracking_code, review_flag, status, list_source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CRU_Direct-Mail-List_Master_v2')
      `).bind(campaign?.id, arm, company, address, county, trackingCode, reviewFlag, status).run();
      inserted++;
    }

    await env.DB.prepare(`
      INSERT INTO audit_log (actor, action, entity, payload)
      VALUES (?, ?, ?, ?)
    `).bind(data.userEmail, 'import_mail_list', 'mail_drops', JSON.stringify({ inserted, summary })).run();

    return new Response(JSON.stringify({
      success: true,
      inserted,
      skipped: skipped.length,
      flagged: flagged.length,
      summary
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Import mail list failed:', error);
    return new Response(JSON.stringify({ error: `Import failed: ${error}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
