// PATCH /api/selections - Update a client's selection (yes/no/later)

interface Env {
  DB: D1Database;
}

interface Data {
  userEmail: string;
}

interface SelectionUpdate {
  client_id: number;
  campaign_id?: number;
  decision: 'yes' | 'no' | 'later';
  note?: string;
}

export const onRequestPatch: PagesFunction<Env, string, Data> = async (context) => {
  const { env, request, data } = context;

  try {
    const body = await request.json() as SelectionUpdate;

    // Get campaign ID - use provided or get the most recent active campaign
    let campaignId = body.campaign_id;
    if (!campaignId) {
      const campaign = await env.DB.prepare(
        `SELECT id FROM campaigns WHERE status = 'active' ORDER BY id DESC LIMIT 1`
      ).first();
      campaignId = campaign?.id as number;

      if (!campaignId) {
        // Fall back to most recent campaign of any status
        const anyCampaign = await env.DB.prepare(
          `SELECT id FROM campaigns ORDER BY id DESC LIMIT 1`
        ).first();
        campaignId = anyCampaign?.id as number;
      }
    }

    if (!campaignId) {
      return new Response(JSON.stringify({ error: 'No campaign found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Upsert the selection
    const result = await env.DB.prepare(`
      INSERT INTO campaign_selections (campaign_id, client_id, decision, note, decided_by, decided_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(campaign_id, client_id) DO UPDATE SET
        decision = excluded.decision,
        note = COALESCE(excluded.note, note),
        decided_by = excluded.decided_by,
        decided_at = datetime('now')
      RETURNING *
    `).bind(
      campaignId,
      body.client_id,
      body.decision,
      body.note || null,
      data.userEmail
    ).first();

    // Log the action
    await env.DB.prepare(`
      INSERT INTO audit_log (actor, action, entity, entity_id, payload)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      data.userEmail,
      'update_selection',
      'campaign_selection',
      result?.id,
      JSON.stringify({ client_id: body.client_id, decision: body.decision })
    ).run();

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Failed to update selection:', error);
    return new Response(JSON.stringify({ error: 'Failed to update selection' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
