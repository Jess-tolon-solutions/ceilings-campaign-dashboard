// GET /api/seo - Returns SEO keywords and pages data
// Query param: ?month=YYYY-MM (defaults to most recent month with data)

interface Env {
  DB: D1Database;
}

interface Keyword {
  id: number;
  keyword: string;
  target_page: string | null;
  position: number | null;
  clicks: number | null;
  impressions: number | null;
}

interface Page {
  id: number;
  url: string;
  clicks: number | null;
  top_query: string | null;
  index_status: string | null;
}

interface MonthRow {
  month: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  const url = new URL(request.url);

  try {
    // Get month from query param or find most recent
    let month = url.searchParams.get('month');
    if (!month) {
      const recentResult = await env.DB.prepare(`
        SELECT month FROM seo_keywords ORDER BY month DESC LIMIT 1
      `).first<MonthRow>();
      month = recentResult?.month || '';
    }

    if (!month) {
      return new Response(JSON.stringify({ keywords: [], pages: [], stats: { targetKeywords: 0, onPageOne: 0, climbing: 0, gaps: 0 }, month: null }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch keywords for month (all keywords are tracked for now)
    const keywordsResult = await env.DB.prepare(`
      SELECT id, keyword, target_page, position, clicks, impressions
      FROM seo_keywords
      WHERE month = ?
      ORDER BY clicks DESC NULLS LAST, position ASC NULLS LAST
    `).bind(month).all<Keyword>();

    // Fetch pages for month
    const pagesResult = await env.DB.prepare(`
      SELECT id, url, clicks, top_query, index_status
      FROM seo_pages
      WHERE month = ?
      ORDER BY clicks DESC NULLS LAST
    `).bind(month).all<Page>();

    // Calculate stats (all keywords treated as tracked until column exists)
    const keywords = keywordsResult.results || [];
    const pages = pagesResult.results || [];

    const onPageOne = keywords.filter(k => k.position !== null && k.position <= 10).length;
    const climbing = keywords.filter(k => k.position !== null && k.position > 10 && k.position <= 30).length;
    const gaps = keywords.filter(k => k.position === null || k.position > 30).length;

    const stats = {
      targetKeywords: keywords.length,
      onPageOne,
      climbing,
      gaps
    };

    return new Response(JSON.stringify({
      keywords,
      pages,
      stats,
      month
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching SEO data:', error);
    return new Response(JSON.stringify({ keywords: [], pages: [], stats: { targetKeywords: 0, onPageOne: 0, climbing: 0, gaps: 0 }, month: null }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
