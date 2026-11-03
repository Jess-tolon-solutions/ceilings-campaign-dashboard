// GET /api/working-on - List items
// POST /api/working-on - Add item (admin only)
// PATCH /api/working-on/:id - Update item (admin only)
// DELETE /api/working-on/:id - Delete item (admin only)

interface Env {
  DB: D1Database;
  ADMIN_EMAILS?: string;
}

interface Data extends Record<string, unknown> {
  userEmail: string;
}

interface WorkingOnItem {
  id: number;
  title: string;
  status: 'in_progress' | 'waiting' | 'done';
  sort_order: number;
}

function isAdmin(email: string, adminEmails: string): boolean {
  const admins = adminEmails.split(',').map(e => e.trim().toLowerCase());
  return admins.includes(email.toLowerCase());
}

export const onRequestGet: PagesFunction<Env, string, Data> = async (context) => {
  const { env } = context;

  try {
    const result = await env.DB.prepare(`
      SELECT id, title, status, sort_order
      FROM working_on
      ORDER BY sort_order ASC, id ASC
    `).all<WorkingOnItem>();

    return new Response(JSON.stringify({ items: result.results || [] }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Failed to load working_on:', error);
    return new Response(JSON.stringify({ items: [] }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const onRequestPost: PagesFunction<Env, string, Data> = async (context) => {
  const { env, request, data } = context;

  if (!isAdmin(data.userEmail, env.ADMIN_EMAILS || '')) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json() as { title: string; status?: string };

    if (!body.title) {
      return new Response(JSON.stringify({ error: 'Title is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get max sort_order
    const maxOrder = await env.DB.prepare(`SELECT MAX(sort_order) as max_order FROM working_on`).first<{ max_order: number }>();
    const newOrder = (maxOrder?.max_order || 0) + 1;

    const result = await env.DB.prepare(`
      INSERT INTO working_on (title, status, sort_order, updated_by)
      VALUES (?, ?, ?, ?)
      RETURNING *
    `).bind(body.title, body.status || 'in_progress', newOrder, data.userEmail).first();

    return new Response(JSON.stringify({ success: true, item: result }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Failed to add working_on item:', error);
    return new Response(JSON.stringify({ error: 'Failed to add item' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
