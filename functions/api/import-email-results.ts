// POST /api/import-email-results - Import Jobber email results CSV
// Admin only, requires preview mode first

interface Env {
  DB: D1Database;
  ADMIN_EMAILS?: string;
}

interface Data extends Record<string, unknown> {
  userEmail: string;
}

interface JobberRow {
  email: string;
  status: string; // delivered, opened, clicked, bounced, etc.
  opens?: number;
  clicks?: number;
}

// Parse CSV
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    rows.push(row);
  }

  return rows;
}

// Count results from Jobber CSV
function countResults(rows: Record<string, string>[]): {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  link_scanner_clicks: number;
} {
  let sent = rows.length;
  let delivered = 0;
  let opened = 0;
  let clicked = 0;
  let bounced = 0;
  let link_scanner_clicks = 0;

  for (const row of rows) {
    const status = (row.status || row.delivery_status || '').toLowerCase();
    const opens = parseInt(row.opens || row.open_count || '0', 10);
    const clicks = parseInt(row.clicks || row.click_count || '0', 10);
    const isLinkScanner = (row.link_scanner || row.is_link_scanner || '').toLowerCase() === 'true' ||
                          (row.notes || '').toLowerCase().includes('link scanner');

    if (status === 'bounced' || status === 'bounce' || status === 'hard_bounce' || status === 'soft_bounce') {
      bounced++;
    } else {
      delivered++;
      if (opens > 0 || status === 'opened' || status === 'open') {
        if (isLinkScanner) {
          link_scanner_clicks++;
        } else {
          opened++;
        }
      }
      if (clicks > 0 || status === 'clicked' || status === 'click') {
        if (!isLinkScanner) {
          clicked++;
        }
      }
    }
  }

  return { sent, delivered, opened, clicked, bounced, link_scanner_clicks };
}

export const onRequestPost: PagesFunction<Env, string, Data> = async (context) => {
  const { request, env, data } = context;

  // Check admin
  const adminEmails = (env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
  const userEmail = data.userEmail || '';
  if (!adminEmails.includes(userEmail.toLowerCase()) && !userEmail.startsWith('service-token:')) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const campaignId = formData.get('campaign_id') as string;
    const preview = formData.get('preview') === 'true';
    const bookedJobs = parseInt(formData.get('booked_jobs') as string || '0', 10);

    if (!file || !campaignId) {
      return new Response(JSON.stringify({ error: 'file and campaign_id required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: 'No data rows found in CSV' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const results = countResults(rows);

    if (preview) {
      return new Response(JSON.stringify({
        preview: true,
        campaign_id: parseInt(campaignId, 10),
        row_count: rows.length,
        sample_headers: Object.keys(rows[0]),
        results: {
          ...results,
          booked_jobs: bookedJobs
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Insert or update results
    await env.DB.prepare(`
      INSERT INTO email_results (campaign_id, sent, delivered, opened, clicked, bounced, link_scanner_clicks, booked_jobs, imported_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(campaign_id) DO UPDATE SET
        sent = excluded.sent,
        delivered = excluded.delivered,
        opened = excluded.opened,
        clicked = excluded.clicked,
        bounced = excluded.bounced,
        link_scanner_clicks = excluded.link_scanner_clicks,
        booked_jobs = excluded.booked_jobs,
        imported_at = datetime('now'),
        imported_by = excluded.imported_by
    `).bind(
      parseInt(campaignId, 10),
      results.sent,
      results.delivered,
      results.opened,
      results.clicked,
      results.bounced,
      results.link_scanner_clicks,
      bookedJobs,
      userEmail
    ).run();

    return new Response(JSON.stringify({
      success: true,
      campaign_id: parseInt(campaignId, 10),
      results: {
        ...results,
        booked_jobs: bookedJobs
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error importing email results:', error);
    return new Response(JSON.stringify({ error: 'Import failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
