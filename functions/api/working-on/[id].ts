// PATCH /api/working-on/:id - Update item (admin only)
// DELETE /api/working-on/:id - Delete item (admin only)

interface Env {
  DB: D1Database;
  ADMIN_EMAILS?: string;
}

interface Data extends Record<string, unknown> {
  userEmail: string;
}

function isAdmin(email: string, adminEmails: string): boolean {
  const admins = adminEmails.split(',').map(e => e.trim().toLowerCase());
  return admins.includes(email.toLowerCase());
}

export const onRequestPatch: PagesFunction<Env, string, Data> = async (context) => {
  const { env, params, request, data } = context;

  if (!isAdmin(data.userEmail, env.ADMIN_EMAILS || '')) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const id = params.id;

  try {
    const body = await request.json() as { title?: string; status?: string; sort_order?: number };

    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (body.title !== undefined) {
      updates.push('title = ?');
      values.push(body.title);
    }
    if (body.status !== undefined) {
      updates.push('status = ?');
      values.push(body.status);
    }
    if (body.sort_order !== undefined) {
      updates.push('sort_order = ?');
      values.push(body.sort_order);
    }

    if (updates.length === 0) {
      return new Response(JSON.stringify({ error: 'No updates provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    updates.push("updated_at = datetime('now')");
    updates.push('updated_by = ?');
    values.push(data.userEmail);
    values.push(id as string);

    const result = await env.DB.prepare(`
      UPDATE working_on
      SET ${updates.join(', ')}
      WHERE id = ?
      RETURNING *
    `).bind(...values).first();

    return new Response(JSON.stringify({ success: true, item: result }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Failed to update working_on item:', error);
    return new Response(JSON.stringify({ error: 'Failed to update item' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const onRequestDelete: PagesFunction<Env, string, Data> = async (context) => {
  const { env, params, data } = context;

  if (!isAdmin(data.userEmail, env.ADMIN_EMAILS || '')) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const id = params.id;

  try {
    await env.DB.prepare(`DELETE FROM working_on WHERE id = ?`).bind(id).run();

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Failed to delete working_on item:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete item' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
