// GET /api/campaigns - List all campaigns with stats

interface Env {
  DB: D1Database;
}

interface Data {
  userEmail: string;
}

export const onRequestGet: PagesFunction<Env, string, Data> = async (context) => {
  const { env } = context;

  try {
    // Get campaigns with aggregated stats
    const result = await env.DB.prepare(`
      SELECT
        c.id,
        c.name,
        c.channel,
        c.status,
        c.round,
        c.launch_date,
        c.description,
        (SELECT COUNT(*) FROM campaign_selections cs WHERE cs.campaign_id = c.id AND cs.decision = 'yes') as targeted,
        (SELECT COUNT(*) FROM responses r WHERE r.campaign_id = c.id) as responses,
        (SELECT COUNT(*) FROM responses r WHERE r.campaign_id = c.id AND r.response_type = 'call') as calls
      FROM campaigns c
      ORDER BY c.created_at DESC
    `).all();

    return new Response(JSON.stringify(result.results), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Failed to load campaigns:', error);
    return new Response(JSON.stringify({ error: 'Failed to load campaigns' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// POST /api/campaigns - Create a new campaign
export const onRequestPost: PagesFunction<Env, string, Data> = async (context) => {
  const { env, request, data } = context;

  try {
    const body = await request.json() as {
      name: string;
      channel: string;
      status?: string;
      round?: number;
      launch_date?: string;
      description?: string;
    };

    const result = await env.DB.prepare(`
      INSERT INTO campaigns (name, channel, status, round, launch_date, description)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING *
    `).bind(
      body.name,
      body.channel,
      body.status || 'draft',
      body.round || 1,
      body.launch_date || null,
      body.description || null
    ).first();

    // Log the action
    await env.DB.prepare(`
      INSERT INTO audit_log (actor, action, entity, entity_id, payload)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      data.userEmail,
      'create',
      'campaign',
      result?.id,
      JSON.stringify(body)
    ).run();

    return new Response(JSON.stringify(result), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Failed to create campaign:', error);
    return new Response(JSON.stringify({ error: 'Failed to create campaign' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
