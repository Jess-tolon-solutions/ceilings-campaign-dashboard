// POST /api/import-tracker - Import from CRU_Campaign_Tracker Google Sheet
// Handles multiple tabs: All Contacts, Campaign 1, Campaign 2, Needs Review
// Preview mode shows counts and issues without loading

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

interface TrackerImportRequest {
  tab: 'all_contacts' | 'campaign_1_sent' | 'campaign_2_approved' | 'needs_review';
  rows: Record<string, string>[];
}

interface PreviewResult {
  success: boolean;
  preview: true;
  tab: string;
  total: number;
  valid: number;
  issues: Array<{ row: number; field: string; message: string }>;
  summary: Record<string, number>;
}

// Normalize company name for matching
function normalizeCompany(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^(the|a|an)/, '')
    .trim();
}

// Map result values from Campaign 1 to response types
function mapResultToResponseType(result: string): { type: string; counts_as_engagement: boolean } {
  const r = (result || '').toLowerCase().trim();

  if (r.includes('link scanner') || r.includes('click only')) {
    return { type: 'link_scanner', counts_as_engagement: false };
  }
  if (r.includes('open') || r.includes('opened')) {
    return { type: 'email_open', counts_as_engagement: true };
  }
  if (r.includes('click')) {
    return { type: 'email_click', counts_as_engagement: true };
  }
  if (r.includes('reply') || r.includes('replied')) {
    return { type: 'email_reply', counts_as_engagement: true };
  }
  if (r.includes('call')) {
    return { type: 'call', counts_as_engagement: true };
  }
  if (r.includes('book') || r.includes('job')) {
    return { type: 'booked_job', counts_as_engagement: true };
  }
  if (r.includes('unsubscribe') || r.includes('opt out')) {
    return { type: 'unsubscribe', counts_as_engagement: false };
  }
  if (r.includes('bounce')) {
    return { type: 'bounce', counts_as_engagement: false };
  }

  return { type: 'other', counts_as_engagement: false };
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
    `).bind(data.userEmail, 'import_tracker_denied', 'tracker', JSON.stringify({ reason: 'Not an admin' })).run();

    return new Response(JSON.stringify({ error: 'Only admins can import' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json() as TrackerImportRequest;
    const { tab, rows } = body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: 'No data provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    switch (tab) {
      case 'all_contacts':
        return await handleAllContacts(env, data, rows, previewOnly);
      case 'campaign_1_sent':
        return await handleCampaign1(env, data, rows, previewOnly);
      case 'campaign_2_approved':
        return await handleCampaign2(env, data, rows, previewOnly);
      case 'needs_review':
        return await handleNeedsReview(env, data, rows, previewOnly);
      default:
        return new Response(JSON.stringify({ error: `Unknown tab: ${tab}` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
    }
  } catch (error) {
    console.error('Import tracker failed:', error);
    return new Response(JSON.stringify({ error: `Import failed: ${error}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Handle "All Contacts" tab - imports to clients table
async function handleAllContacts(env: Env, data: Data, rows: Record<string, string>[], previewOnly: boolean): Promise<Response> {
  const issues: Array<{ row: number; field: string; message: string }> = [];
  const validRows: Array<{ rowNum: number; data: Record<string, string> }> = [];

  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // 1-indexed + header
    const company = row.company || row.Company || row['Company Name'] || row.business || '';

    if (!company.trim()) {
      issues.push({ row: rowNum, field: 'company', message: 'Company name is required' });
      return;
    }

    validRows.push({ rowNum, data: row });
  });

  const summary = {
    total: rows.length,
    valid: validRows.length,
    invalid: issues.length,
    will_insert: validRows.length // All are new since DB is empty
  };

  if (previewOnly) {
    return new Response(JSON.stringify({
      success: true,
      preview: true,
      tab: 'all_contacts',
      total: rows.length,
      valid: validRows.length,
      issues: issues.slice(0, 50),
      summary
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Actually insert
  let inserted = 0;
  for (const { data: row } of validRows) {
    const company = row.company || row.Company || row['Company Name'] || row.business || '';
    const contactName = row.contact_name || row['Contact Name'] || row.contact || row.name || '';
    const email = row.email || row.Email || '';
    const phone = row.phone || row.Phone || '';
    const address = row.address || row.Address || '';
    const city = row.city || row.City || '';
    const county = row.county || row.County || '';
    const segment = row.segment || row.Segment || '';
    const flag = row.flag || row.Flag || '';
    const notes = row.notes || row.Notes || '';

    await env.DB.prepare(`
      INSERT INTO clients (company, contact_name, email, phone, address, city, county, segment, flag, notes, client_status, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'existing_client', 'jobber')
    `).bind(company, contactName, email, phone, address, city, county, segment, flag, notes).run();
    inserted++;
  }

  // Log the import
  await env.DB.prepare(`
    INSERT INTO audit_log (actor, action, entity, payload)
    VALUES (?, ?, ?, ?)
  `).bind(data.userEmail, 'import_all_contacts', 'clients', JSON.stringify({ inserted })).run();

  return new Response(JSON.stringify({
    success: true,
    tab: 'all_contacts',
    inserted,
    issues: issues.slice(0, 50)
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Handle "Campaign 1 – Sent" tab - imports to responses table
async function handleCampaign1(env: Env, data: Data, rows: Record<string, string>[], previewOnly: boolean): Promise<Response> {
  const issues: Array<{ row: number; field: string; message: string }> = [];
  const resultCounts: Record<string, number> = {};
  const validRows: Array<{ rowNum: number; data: Record<string, string>; responseType: string; countsAsEngagement: boolean }> = [];

  // Get or create Email 1 campaign
  let campaign = await env.DB.prepare(`SELECT id FROM campaigns WHERE name LIKE '%Email 1%' OR name LIKE '%Sept%' LIMIT 1`).first();

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const rowNum = idx + 2;
    const result = row.result || row.Result || row.Status || '';
    const company = row.company || row.Company || row['Company Name'] || '';

    if (!company.trim()) {
      issues.push({ row: rowNum, field: 'company', message: 'Company name required to match client' });
      continue;
    }

    const { type, counts_as_engagement } = mapResultToResponseType(result);
    resultCounts[type] = (resultCounts[type] || 0) + 1;

    validRows.push({ rowNum, data: row, responseType: type, countsAsEngagement: counts_as_engagement });
  }

  const summary = {
    total: rows.length,
    valid: validRows.length,
    by_result_type: resultCounts,
    link_scanners_excluded: resultCounts['link_scanner'] || 0
  };

  if (previewOnly) {
    return new Response(JSON.stringify({
      success: true,
      preview: true,
      tab: 'campaign_1_sent',
      total: rows.length,
      valid: validRows.length,
      issues: issues.slice(0, 50),
      summary
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Create campaign if needed
  if (!campaign) {
    await env.DB.prepare(`
      INSERT INTO campaigns (name, channel, status, round, description)
      VALUES ('Email 1 – Sept', 'email', 'completed', 1, 'First email campaign, September')
    `).run();
    campaign = await env.DB.prepare(`SELECT id FROM campaigns WHERE name = 'Email 1 – Sept'`).first();
  }

  let inserted = 0;
  for (const { data: row, responseType } of validRows) {
    const company = row.company || row.Company || row['Company Name'] || '';

    // Find matching client
    const client = await env.DB.prepare(`
      SELECT id FROM clients WHERE company = ? OR company LIKE ?
    `).bind(company, `%${company}%`).first();

    if (client) {
      // Mark client as contacted in Email 1
      await env.DB.prepare(`UPDATE clients SET contacted_in_email_1 = 1 WHERE id = ?`).bind(client.id).run();

      await env.DB.prepare(`
        INSERT INTO responses (campaign_id, client_id, channel, response_type, notes)
        VALUES (?, ?, 'email', ?, ?)
      `).bind(campaign?.id, client.id, responseType, row.notes || row.Notes || '').run();
      inserted++;
    }
  }

  await env.DB.prepare(`
    INSERT INTO audit_log (actor, action, entity, payload)
    VALUES (?, ?, ?, ?)
  `).bind(data.userEmail, 'import_campaign_1', 'responses', JSON.stringify({ inserted, summary })).run();

  return new Response(JSON.stringify({
    success: true,
    tab: 'campaign_1_sent',
    inserted,
    summary
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Handle "Campaign 2 – Approved" tab - imports to campaign_selections
async function handleCampaign2(env: Env, data: Data, rows: Record<string, string>[], previewOnly: boolean): Promise<Response> {
  const issues: Array<{ row: number; field: string; message: string }> = [];
  const validRows: Array<{ rowNum: number; data: Record<string, string> }> = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const rowNum = idx + 2;
    const company = row.company || row.Company || row['Company Name'] || '';

    if (!company.trim()) {
      issues.push({ row: rowNum, field: 'company', message: 'Company name required' });
      continue;
    }

    validRows.push({ rowNum, data: row });
  }

  const summary = {
    total: rows.length,
    valid: validRows.length,
    will_mark_as_yes: validRows.length
  };

  if (previewOnly) {
    return new Response(JSON.stringify({
      success: true,
      preview: true,
      tab: 'campaign_2_approved',
      total: rows.length,
      valid: validRows.length,
      issues: issues.slice(0, 50),
      summary
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Get or create Email 2 campaign
  let campaign = await env.DB.prepare(`SELECT id FROM campaigns WHERE name LIKE '%Email 2%' LIMIT 1`).first();
  if (!campaign) {
    await env.DB.prepare(`
      INSERT INTO campaigns (name, channel, status, round, description)
      VALUES ('Email 2 – Sept 22', 'email', 'completed', 2, 'Second email campaign, Sept 22')
    `).run();
    campaign = await env.DB.prepare(`SELECT id FROM campaigns WHERE name = 'Email 2 – Sept 22'`).first();
  }

  let inserted = 0;
  for (const { data: row } of validRows) {
    const company = row.company || row.Company || row['Company Name'] || '';
    const status = row.status || row.Status || '';

    const client = await env.DB.prepare(`
      SELECT id FROM clients WHERE company = ? OR company LIKE ?
    `).bind(company, `%${company}%`).first();

    if (client) {
      await env.DB.prepare(`
        INSERT INTO campaign_selections (campaign_id, client_id, decision, note, decided_by, decided_at)
        VALUES (?, ?, 'yes', ?, 'import', datetime('now'))
        ON CONFLICT(campaign_id, client_id) DO UPDATE SET decision = 'yes', note = excluded.note
      `).bind(campaign?.id, client.id, status).run();
      inserted++;
    }
  }

  await env.DB.prepare(`
    INSERT INTO audit_log (actor, action, entity, payload)
    VALUES (?, ?, ?, ?)
  `).bind(data.userEmail, 'import_campaign_2', 'campaign_selections', JSON.stringify({ inserted })).run();

  return new Response(JSON.stringify({
    success: true,
    tab: 'campaign_2_approved',
    inserted
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Handle "Needs Review – Jonathan" tab - imports to campaign_selections for Email 3
async function handleNeedsReview(env: Env, data: Data, rows: Record<string, string>[], previewOnly: boolean): Promise<Response> {
  const issues: Array<{ row: number; field: string; message: string }> = [];
  const counts = { yes: 0, no: 0, not_reviewed: 0, invalid: 0 };

  const validRows: Array<{ rowNum: number; data: Record<string, string>; decision: string | null }> = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const rowNum = idx + 2;
    const company = row.company || row.Company || row['Company Name'] || '';
    const decision = (row.decision || row.Decision || row.Pick || row.pick || '').toUpperCase().trim();

    if (!company.trim()) {
      issues.push({ row: rowNum, field: 'company', message: 'Company name required' });
      counts.invalid++;
      continue;
    }

    let mappedDecision: string | null = null;
    if (decision === 'YES' || decision === 'Y') {
      mappedDecision = 'yes';
      counts.yes++;
    } else if (decision === 'NO' || decision === 'N') {
      mappedDecision = 'no';
      counts.no++;
    } else {
      // Blank = not reviewed, don't create a row
      counts.not_reviewed++;
    }

    validRows.push({ rowNum, data: row, decision: mappedDecision });
  }

  const summary = {
    total: rows.length,
    yes: counts.yes,
    no: counts.no,
    not_reviewed: counts.not_reviewed,
    invalid: counts.invalid,
    expected: { yes: 34, no: 16, open: 229 }
  };

  if (previewOnly) {
    return new Response(JSON.stringify({
      success: true,
      preview: true,
      tab: 'needs_review',
      total: rows.length,
      valid: validRows.length,
      issues: issues.slice(0, 50),
      summary,
      counts_match_expected: counts.yes === 34 && counts.no === 16
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Get or create Email 3 campaign
  let campaign = await env.DB.prepare(`SELECT id FROM campaigns WHERE name LIKE '%Email 3%' OR name LIKE '%Next Round%' LIMIT 1`).first();
  if (!campaign) {
    await env.DB.prepare(`
      INSERT INTO campaigns (name, channel, status, round, description)
      VALUES ('Email 3 – Next Round', 'email', 'active', 3, 'Third email campaign - needs picks')
    `).run();
    campaign = await env.DB.prepare(`SELECT id FROM campaigns WHERE name = 'Email 3 – Next Round'`).first();
  }

  let inserted = 0;
  for (const { data: row, decision } of validRows) {
    if (!decision) continue; // Skip not reviewed

    const company = row.company || row.Company || row['Company Name'] || '';

    const client = await env.DB.prepare(`
      SELECT id FROM clients WHERE company = ? OR company LIKE ?
    `).bind(company, `%${company}%`).first();

    if (client) {
      await env.DB.prepare(`
        INSERT INTO campaign_selections (campaign_id, client_id, decision, decided_by, decided_at)
        VALUES (?, ?, ?, 'Jonathan (import)', datetime('now'))
        ON CONFLICT(campaign_id, client_id) DO UPDATE SET decision = excluded.decision
      `).bind(campaign?.id, client.id, decision).run();
      inserted++;
    }
  }

  await env.DB.prepare(`
    INSERT INTO audit_log (actor, action, entity, payload)
    VALUES (?, ?, ?, ?)
  `).bind(data.userEmail, 'import_needs_review', 'campaign_selections', JSON.stringify({ inserted, summary })).run();

  return new Response(JSON.stringify({
    success: true,
    tab: 'needs_review',
    inserted,
    summary
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
