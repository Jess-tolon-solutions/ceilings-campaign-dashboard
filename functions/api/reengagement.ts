// GET /api/reengagement - List reengagement contacts with counts
// PATCH /api/reengagement - Update contact status

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

    // Get contacts for the requested status
    const contactsResult = await env.DB.prepare(`
      SELECT
        id, email, client_names, phone, job_type, last_invoice_date,
        segment, email_version, status, status_reason,
        campaign1_status, round2_status, round2_note,
        contacted, admin_note, source, rows_sharing_email, is_biloholding
      FROM reengagement_contacts
      WHERE status = ?
      ORDER BY
        is_biloholding DESC,
        CASE email_version
          WHEN 'recent' THEN 1
          WHEN 'lapsed' THEN 2
          WHEN 'dormant' THEN 3
        END,
        last_invoice_date DESC
    `).bind(status).all();

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

// POST /api/reengagement - Bulk update (move multiple contacts)
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
      ids: number[];
      status: string;
    };

    if (!body.ids?.length || !body.status) {
      return new Response(JSON.stringify({ error: 'Missing ids or status' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const placeholders = body.ids.map(() => '?').join(',');
    await env.DB.prepare(`
      UPDATE reengagement_contacts
      SET status = ?, updated_at = datetime('now')
      WHERE id IN (${placeholders})
    `).bind(body.status, ...body.ids).run();

    return new Response(JSON.stringify({
      success: true,
      updated: body.ids.length
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Failed to bulk update:', error);
    return new Response(JSON.stringify({ error: 'Failed to update' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
