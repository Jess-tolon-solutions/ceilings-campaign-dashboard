// GET /api/clients - List all clients with their current selection status
// Query params:
//   campaign_id: filter by campaign
//   exclude_approved_in: comma-separated campaign IDs to exclude clients already approved

interface Env {
  DB: D1Database;
}

interface Data extends Record<string, unknown> {
  userEmail: string;
}

export const onRequestGet: PagesFunction<Env, string, Data> = async (context) => {
  const { env, request } = context;
  const url = new URL(request.url);
  const campaignId = url.searchParams.get('campaign_id');
  const excludeApprovedIn = url.searchParams.get('exclude_approved_in');

  try {
    // Build exclusion subquery for clients already approved in other campaigns
    let exclusionClause = '';
    const excludeCampaigns = excludeApprovedIn ? excludeApprovedIn.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id)) : [];

    if (excludeCampaigns.length > 0) {
      const placeholders = excludeCampaigns.map(() => '?').join(',');
      exclusionClause = `
        AND c.id NOT IN (
          SELECT client_id FROM campaign_selections
          WHERE campaign_id IN (${placeholders}) AND decision = 'yes'
        )
      `;
    }

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
      // Get selection from most recent active campaign if not specified
      query += ` AND cs.campaign_id = (SELECT id FROM campaigns WHERE channel = 'email' AND status = 'active' ORDER BY id DESC LIMIT 1)`;
    }

    query += ` WHERE 1=1 ${exclusionClause}`;
    query += ` ORDER BY c.company ASC`;

    // Build params array
    const params: (string | number)[] = [];
    if (campaignId) {
      params.push(campaignId);
    }
    params.push(...excludeCampaigns);

    const stmt = env.DB.prepare(query);
    const result = params.length > 0
      ? await stmt.bind(...params).all()
      : await stmt.all();

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
