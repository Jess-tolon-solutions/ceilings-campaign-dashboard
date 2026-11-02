// GET /api/call-sheet/log - Returns touch/status data for violations repo
// Requires service token auth

interface Env {
  DB: D1Database;
}

interface LogRow {
  dbpr_license: string;
  touches: number;
  last_touch_at: string | null;
  status: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // Verify service token
  const clientId = request.headers.get('CF-Access-Client-Id');
  const clientSecret = request.headers.get('CF-Access-Client-Secret');

  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Get most recent record per license with touch/status info
    const result = await env.DB.prepare(`
      SELECT dbpr_license, touches, last_touch_at, status
      FROM call_sheet
      WHERE id IN (
        SELECT MAX(id) FROM call_sheet GROUP BY dbpr_license
      )
      ORDER BY dbpr_license
    `).all<LogRow>();

    return new Response(JSON.stringify({
      businesses: result.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching call sheet log:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch log' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
