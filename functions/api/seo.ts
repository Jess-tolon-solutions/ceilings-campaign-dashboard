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
  tracked: number;
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

    // Fetch keywords for month with tracked status
    const keywordsResult = await env.DB.prepare(`
      SELECT id, keyword, target_page, position, clicks, impressions, COALESCE(tracked, 1) as tracked
      FROM seo_keywords
      WHERE month = ?
      ORDER BY tracked DESC, clicks DESC NULLS LAST, position ASC NULLS LAST
    `).bind(month).all<Keyword>();

    // Fetch pages for month
    const pagesResult = await env.DB.prepare(`
      SELECT id, url, clicks, top_query, index_status
      FROM seo_pages
      WHERE month = ?
      ORDER BY clicks DESC NULLS LAST
    `).bind(month).all<Page>();

    const keywords = keywordsResult.results || [];
    const pages = pagesResult.results || [];

    // Stats based on tracked keywords only
    const trackedKeywords = keywords.filter(k => k.tracked === 1);
    const onPageOne = trackedKeywords.filter(k => k.position !== null && k.position <= 10).length;
    const climbing = trackedKeywords.filter(k => k.position !== null && k.position > 10 && k.position <= 30).length;
    const gaps = trackedKeywords.filter(k => k.position === null || k.position > 30).length;

    const stats = {
      targetKeywords: trackedKeywords.length,
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
