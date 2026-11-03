// GET /api/email-results - Returns email results for all campaigns
// GET /api/email-results/:campaignId - Returns email results for a specific campaign

interface Env {
  DB: D1Database;
}

interface EmailResult {
  id: number;
  campaign_id: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  link_scanner_clicks: number;
  booked_jobs: number;
  imported_at: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env } = context;

  try {
    const result = await env.DB.prepare(`
      SELECT er.*, c.name as campaign_name, c.status as campaign_status
      FROM email_results er
      JOIN campaigns c ON er.campaign_id = c.id
      ORDER BY er.campaign_id
    `).all();

    return new Response(JSON.stringify({
      results: result.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching email results:', error);
    return new Response(JSON.stringify({ results: [] }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
