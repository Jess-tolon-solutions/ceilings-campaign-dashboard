// PATCH /api/call-sheet/:id - Update outcome for a call sheet entry
// Sets status, increments touches, updates last_touch_at

interface Env {
  DB: D1Database;
}

interface UpdatePayload {
  status?: string;
  outcome_note?: string;
  outcome_by?: string;
}

interface Data extends Record<string, unknown> {
  status?: string;
  outcome_note?: string;
  outcome_by?: string;
}

const VALID_STATUSES = ['open', 'visited', 'called', 'won', 'not_interested', 'closed', 'closed_gone', 'do_not_contact'];

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const id = params.id as string;

  try {
    const data: Data = await request.json();
    const { status, outcome_note, outcome_by } = data;

    // Validate status if provided
    if (status && !VALID_STATUSES.includes(status)) {
      return new Response(JSON.stringify({ error: 'Invalid status' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get current record
    const existing = await env.DB.prepare(`
      SELECT id, touches FROM call_sheet WHERE id = ?
    `).bind(id).first<{ id: number; touches: number }>();

    if (!existing) {
      return new Response(JSON.stringify({ error: 'Record not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Build update query
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (status) {
      updates.push('status = ?');
      values.push(status);

      // Increment touches and set last_touch_at when status changes to an action
      if (['visited', 'called'].includes(status)) {
        updates.push('touches = touches + 1');
        updates.push("last_touch_at = datetime('now')");
      }
    }

    if (outcome_note !== undefined) {
      updates.push('outcome_note = ?');
      values.push(outcome_note);
    }

    if (outcome_by !== undefined) {
      updates.push('outcome_by = ?');
      values.push(outcome_by);
    }

    updates.push("updated_at = datetime('now')");
    values.push(id);

    await env.DB.prepare(`
      UPDATE call_sheet SET ${updates.join(', ')} WHERE id = ?
    `).bind(...values).run();

    // Fetch updated record
    const updated = await env.DB.prepare(`
      SELECT * FROM call_sheet WHERE id = ?
    `).bind(id).first();

    return new Response(JSON.stringify({ success: true, record: updated }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error updating call sheet:', error);
    return new Response(JSON.stringify({ error: 'Failed to update record' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
