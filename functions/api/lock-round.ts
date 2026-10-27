// POST /api/lock-round - Freeze selections and export CSV
// Jess only - freezes the current round and generates export

interface Env {
  DB: D1Database;
}

interface Data {
  userEmail: string;
}

// Allowed users who can lock rounds
const ADMIN_EMAILS = ['jess@tolonsolutions.com', 'jessicatolon@gmail.com'];

export const onRequestPost: PagesFunction<Env, string, Data> = async (context) => {
  const { env, request, data } = context;

  // Check if user is admin
  if (!ADMIN_EMAILS.some(email => data.userEmail.toLowerCase() === email.toLowerCase())) {
    return new Response(JSON.stringify({ error: 'Only Jess can lock rounds' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json() as { campaign_id?: number };

    // Get campaign ID - use provided or get most recent active
    let campaignId = body.campaign_id;
    if (!campaignId) {
      const campaign = await env.DB.prepare(
        `SELECT id FROM campaigns WHERE status = 'active' ORDER BY id DESC LIMIT 1`
      ).first();
      campaignId = campaign?.id as number;
    }

    if (!campaignId) {
      return new Response(JSON.stringify({ error: 'No active campaign found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get all "yes" selections with client details
    const selections = await env.DB.prepare(`
      SELECT
        c.id,
        c.company,
        c.contact_name,
        c.title,
        c.email,
        c.phone,
        c.address,
        c.city,
        c.county,
        c.segment,
        c.locations_count,
        cs.decision,
        cs.note,
        cs.decided_by,
        cs.decided_at
      FROM clients c
      JOIN campaign_selections cs ON c.id = cs.client_id
      WHERE cs.campaign_id = ? AND cs.decision = 'yes'
      ORDER BY c.company
    `).bind(campaignId).all();

    // Get campaign info
    const campaign = await env.DB.prepare(
      `SELECT * FROM campaigns WHERE id = ?`
    ).bind(campaignId).first();

    // Update campaign status to indicate round is locked
    await env.DB.prepare(`
      UPDATE campaigns
      SET status = 'paused',
          description = COALESCE(description || ' ', '') || '[Round ' || round || ' locked ' || datetime('now') || ']'
      WHERE id = ?
    `).bind(campaignId).run();

    // Generate CSV content
    const headers = ['Company', 'Contact Name', 'Title', 'Email', 'Phone', 'Address', 'City', 'County', 'Segment', 'Locations', 'Note'];
    const csvRows = [headers.join(',')];

    for (const row of selections.results) {
      const values = [
        escapeCSV(row.company as string),
        escapeCSV(row.contact_name as string),
        escapeCSV(row.title as string),
        escapeCSV(row.email as string),
        escapeCSV(row.phone as string),
        escapeCSV(row.address as string),
        escapeCSV(row.city as string),
        escapeCSV(row.county as string),
        escapeCSV(row.segment as string),
        row.locations_count || 1,
        escapeCSV(row.note as string)
      ];
      csvRows.push(values.join(','));
    }

    const csv = csvRows.join('\n');

    // Log the action
    await env.DB.prepare(`
      INSERT INTO audit_log (actor, action, entity, entity_id, payload)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      data.userEmail,
      'lock_round',
      'campaign',
      campaignId,
      JSON.stringify({
        campaign_name: campaign?.name,
        round: campaign?.round,
        selected_count: selections.results.length
      })
    ).run();

    return new Response(JSON.stringify({
      success: true,
      campaign_id: campaignId,
      campaign_name: campaign?.name,
      round: campaign?.round,
      selected_count: selections.results.length,
      csv: csv
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Lock round failed:', error);
    return new Response(JSON.stringify({ error: `Lock round failed: ${error}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

function escapeCSV(value: string | null | undefined): string {
  if (!value) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
