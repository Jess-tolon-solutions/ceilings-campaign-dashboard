// GET /api/clients - List all clients with their current selection status

interface Env {
  DB: D1Database;
}

interface Data {
  userEmail: string;
}

export const onRequestGet: PagesFunction<Env, string, Data> = async (context) => {
  const { env, request } = context;
  const url = new URL(request.url);
  const campaignId = url.searchParams.get('campaign_id');

  try {
    // Get clients with their selection for the specified campaign (or most recent)
    let query = `
      SELECT
        c.*,
        cs.decision,
        cs.note,
        cs.decided_by,
        cs.decided_at
      FROM clients c
      LEFT JOIN campaign_selections cs ON c.id = cs.client_id
    `;

    if (campaignId) {
      query += ` AND cs.campaign_id = ?`;
    } else {
      // Get selection from most recent campaign if not specified
      query += ` AND cs.campaign_id = (SELECT MAX(id) FROM campaigns)`;
    }

    query += ` ORDER BY c.company ASC`;

    const result = campaignId
      ? await env.DB.prepare(query).bind(campaignId).all()
      : await env.DB.prepare(query).all();

    return new Response(JSON.stringify(result.results), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Failed to load clients:', error);
    return new Response(JSON.stringify({ error: 'Failed to load clients' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
