// GET /api/reengagement - List reengagement contacts with counts
// PATCH /api/reengagement - Update contact status
// POST /api/reengagement/lock - Export approved contacts for Jobber

interface Env {
  DB: D1Database;
}

interface Data extends Record<string, unknown> {
  userEmail: string;
}

const ADMIN_EMAILS = ['jess@tolonsolutions.com', 'jessicatolon@gmail.com'];

export const onRequestGet: PagesFunction<Env, string, Data> = async (context) => {
  const { env, request } = context;
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'to_review';
  const segmentFilter = url.searchParams.get('segment') || '';

  try {
    // Get counts for all tabs
    const countsResult = await env.DB.prepare(`
      SELECT status, COUNT(*) as count FROM reengagement_contacts GROUP BY status
    `).all();

    const counts: Record<string, number> = {
      to_review: 0,
      approved: 0,
      not_now: 0,
      already_contacted: 0,
      cant_email: 0
    };
    for (const row of countsResult.results as { status: string; count: number }[]) {
      counts[row.status] = row.count;
    }

    // Get counts by segment for approved
    const segmentCountsResult = await env.DB.prepare(`
      SELECT email_version, COUNT(*) as count
      FROM reengagement_contacts
      WHERE status = 'approved'
      GROUP BY email_version
    `).all();

    const segmentCounts: Record<string, number> = {
      recent: 0,
      lapsed: 0,
      dormant: 0
    };
    for (const row of segmentCountsResult.results as { email_version: string; count: number }[]) {
      segmentCounts[row.email_version] = row.count;
    }

    // Build query with optional segment filter
    let whereClause = 'WHERE status = ?';
    const params: (string | number)[] = [status];

    if (segmentFilter) {
      whereClause += ' AND segment = ?';
      params.push(segmentFilter);
    }

    // Order: Last 12 Months first for To review, then by invoice date
    const orderClause = `
      ORDER BY
        CASE WHEN is_biloholding = 1 THEN 0 ELSE 1 END,
        CASE segment
          WHEN 'Last 12 Months' THEN 1
          WHEN '1-3 Years' THEN 2
          WHEN '3+ Years' THEN 3
          ELSE 4
        END,
        last_invoice_date DESC
    `;

    // Get contacts for the requested status
    const contactsResult = await env.DB.prepare(`
      SELECT
        id, email, client_names, phone, job_type, last_invoice_date,
        segment, email_version, status, status_reason, badge,
        campaign1_status, round2_status, round2_note,
        old_decision, do_not_send, hold,
        contacted, admin_note, source, rows_sharing_email, is_biloholding
      FROM reengagement_contacts
      ${whereClause}
      ${orderClause}
    `).bind(...params).all();

    // Parse client_names JSON
    const contacts = (contactsResult.results as Record<string, unknown>[]).map(c => ({
      ...c,
      client_names: JSON.parse(c.client_names as string || '[]')
    }));

    // Get campaign results
    const resultsResult = await env.DB.prepare(`
      SELECT * FROM reengagement_results ORDER BY campaign_name
    `).all();

    return new Response(JSON.stringify({
      counts,
      segmentCounts,
      contacts,
      campaignResults: resultsResult.results
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Failed to load reengagement data:', error);
    return new Response(JSON.stringify({ error: 'Failed to load data' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const onRequestPatch: PagesFunction<Env, string, Data> = async (context) => {
  const { env, request, data } = context;

  try {
    const body = await request.json() as {
      id: number;
      status?: string;
      admin_note?: string;
      do_not_send?: boolean;
    };

    if (!body.id) {
      return new Response(JSON.stringify({ error: 'Missing contact id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (body.status) {
      updates.push('status = ?');
      values.push(body.status);
    }

    if (body.admin_note !== undefined) {
      updates.push('admin_note = ?');
      values.push(body.admin_note);
    }

    if (body.do_not_send !== undefined) {
      updates.push('do_not_send = ?');
      values.push(body.do_not_send ? 1 : 0);
    }

    updates.push('updated_at = datetime(\'now\')');
    values.push(body.id);

    await env.DB.prepare(`
      UPDATE reengagement_contacts
      SET ${updates.join(', ')}
      WHERE id = ?
    `).bind(...values).run();

    // Return updated record
    const record = await env.DB.prepare(`
      SELECT * FROM reengagement_contacts WHERE id = ?
    `).bind(body.id).first();

    return new Response(JSON.stringify({
      success: true,
      record: {
        ...record,
        client_names: JSON.parse((record as Record<string, unknown>)?.client_names as string || '[]')
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Failed to update contact:', error);
    return new Response(JSON.stringify({ error: 'Failed to update' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// POST /api/reengagement - Lock round / update results
export const onRequestPost: PagesFunction<Env, string, Data> = async (context) => {
  const { env, request, data } = context;

  // Check admin
  const isAdmin = ADMIN_EMAILS.some(e => e.toLowerCase() === data.userEmail?.toLowerCase());
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json() as {
      action: string;
      // For lock
      ids?: number[];
      // For update_results
      campaign_name?: string;
      replies?: number;
      calls_mentioning_cru25?: number;
      booked_jobs?: number;
      revenue?: number;
    };

    if (body.action === 'lock') {
      // Export approved contacts for Jobber
      const approvedResult = await env.DB.prepare(`
        SELECT email, client_names, email_version
        FROM reengagement_contacts
        WHERE status = 'approved'
        ORDER BY email_version, email
      `).all();

      // Build CSV: email, client_name (one row per client name), email_version
      const csvRows: string[] = ['Email,Client Name,Email Version'];

      for (const contact of approvedResult.results as { email: string; client_names: string; email_version: string }[]) {
        const clientNames = JSON.parse(contact.client_names || '[]') as string[];
        for (const name of clientNames) {
          // Escape quotes in names
          const escapedName = name.replace(/"/g, '""');
          csvRows.push(`"${contact.email}","${escapedName}","${contact.email_version}"`);
        }
      }

      const csv = csvRows.join('\n');

      return new Response(JSON.stringify({
        success: true,
        csv,
        count: approvedResult.results.length,
        filename: `reengagement_approved_${new Date().toISOString().slice(0, 10)}.csv`
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (body.action === 'update_results') {
      const updates: string[] = [];
      const values: (string | number)[] = [];

      // Core metrics (for Round 2 admin entry)
      if (body.sent !== undefined) {
        updates.push('sent = ?');
        values.push(body.sent);
      }
      if (body.bounced !== undefined) {
        updates.push('bounced = ?');
        values.push(body.bounced);
      }
      if (body.delivered !== undefined) {
        updates.push('delivered = ?');
        values.push(body.delivered);
      }
      if (body.opened !== undefined) {
        updates.push('opened = ?');
        values.push(body.opened);
      }
      if (body.clicked !== undefined) {
        updates.push('clicked = ?');
        values.push(body.clicked);
      }
      if (body.link_scanner_clicks !== undefined) {
        updates.push('link_scanner_clicks = ?');
        values.push(body.link_scanner_clicks);
      }
      if (body.bounce_list !== undefined) {
        updates.push('bounce_list = ?');
        values.push(body.bounce_list);
      }

      // Tracking fields
      if (body.replies !== undefined) {
        updates.push('replies = ?');
        values.push(body.replies);
      }
      if (body.calls_mentioning_cru25 !== undefined) {
        updates.push('calls_mentioning_cru25 = ?');
        values.push(body.calls_mentioning_cru25);
      }
      if (body.booked_jobs !== undefined) {
        updates.push('booked_jobs = ?');
        values.push(body.booked_jobs);
      }
      if (body.revenue !== undefined) {
        updates.push('revenue = ?');
        values.push(body.revenue);
      }

      if (updates.length > 0 && body.campaign_name) {
        updates.push('updated_at = datetime(\'now\')');
        values.push(body.campaign_name);

        await env.DB.prepare(`
          UPDATE reengagement_results
          SET ${updates.join(', ')}
          WHERE campaign_name = ?
        `).bind(...values).run();
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Failed to process request:', error);
    return new Response(JSON.stringify({ error: 'Failed to process' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
