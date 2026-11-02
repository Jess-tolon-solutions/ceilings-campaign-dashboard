// GET /api/seo - Returns SEO keywords and pages data

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

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env } = context;

  try {
    // Get current month in YYYY-MM format
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Fetch keywords for current month
    const keywordsResult = await env.DB.prepare(`
      SELECT id, keyword, target_page, position, clicks, impressions, tracked
      FROM seo_keywords
      WHERE month = ?
      ORDER BY clicks DESC NULLS LAST
    `).bind(currentMonth).all<Keyword>();

    // Fetch pages for current month
    const pagesResult = await env.DB.prepare(`
      SELECT id, url, clicks, top_query, index_status
      FROM seo_pages
      WHERE month = ?
      ORDER BY clicks DESC NULLS LAST
    `).bind(currentMonth).all<Page>();

    // Calculate stats
    const keywords = keywordsResult.results || [];
    const pages = pagesResult.results || [];

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
      stats
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching SEO data:', error);
    return new Response(JSON.stringify({ keywords: [], pages: [], stats: { targetKeywords: 0, onPageOne: 0, climbing: 0, gaps: 0 } }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
