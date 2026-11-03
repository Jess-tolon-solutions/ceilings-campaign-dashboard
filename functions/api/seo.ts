// GET /api/seo - Returns SEO keywords and pages data with previous month comparison
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

interface KeywordWithChange extends Keyword {
  previousPosition: number | null;
  positionChange: number | null; // negative = improved (moved up)
}

function getPreviousMonth(month: string): string {
  const [year, m] = month.split('-').map(Number);
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? year - 1 : year;
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
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
      return new Response(JSON.stringify({
        keywords: [],
        pages: [],
        stats: { targetKeywords: 0, onPageOne: 0, closeToPageOne: 0, movedUp: 0, gaps: 0 },
        opportunities: [],
        movedUpList: [],
        month: null,
        previousMonth: null
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const previousMonth = getPreviousMonth(month);

    // Fetch current and previous month keywords in parallel
    const [keywordsResult, previousKeywordsResult, pagesResult] = await Promise.all([
      env.DB.prepare(`
        SELECT id, keyword, target_page, position, clicks, impressions, COALESCE(tracked, 1) as tracked
        FROM seo_keywords
        WHERE month = ?
        ORDER BY tracked DESC, clicks DESC NULLS LAST, position ASC NULLS LAST
      `).bind(month).all<Keyword>(),
      env.DB.prepare(`
        SELECT keyword, position
        FROM seo_keywords
        WHERE month = ?
      `).bind(previousMonth).all<{ keyword: string; position: number | null }>(),
      env.DB.prepare(`
        SELECT id, url, clicks, top_query, index_status
        FROM seo_pages
        WHERE month = ?
        ORDER BY clicks DESC NULLS LAST
      `).bind(month).all<Page>()
    ]);

    // Create lookup for previous month positions
    const previousPositions = new Map<string, number | null>();
    for (const kw of previousKeywordsResult.results || []) {
      previousPositions.set(kw.keyword.toLowerCase(), kw.position);
    }

    // Enhance keywords with previous month comparison
    const keywords: KeywordWithChange[] = (keywordsResult.results || []).map(kw => {
      const prevPos = previousPositions.get(kw.keyword.toLowerCase());
      let positionChange: number | null = null;

      if (kw.position !== null && prevPos !== null) {
        positionChange = kw.position - prevPos; // negative = improved
      }

      return {
        ...kw,
        previousPosition: prevPos !== undefined ? prevPos : null,
        positionChange
      };
    });

    const pages = pagesResult.results || [];

    // Stats based on tracked keywords only
    const trackedKeywords = keywords.filter(k => k.tracked === 1);
    const onPageOne = trackedKeywords.filter(k => k.position !== null && k.position <= 10);
    const closeToPageOne = trackedKeywords.filter(k => k.position !== null && k.position > 10 && k.position <= 20);
    const movedUp = trackedKeywords.filter(k => k.positionChange !== null && k.positionChange < 0);
    const gaps = trackedKeywords.filter(k => k.position === null || k.position > 30);

    const stats = {
      targetKeywords: trackedKeywords.length,
      onPageOne: onPageOne.length,
      closeToPageOne: closeToPageOne.length,
      movedUp: movedUp.length,
      gaps: gaps.length
    };

    // Opportunity list: keywords close to page one (positions 11-20)
    const opportunities = closeToPageOne.map(k => ({
      keyword: k.keyword,
      position: k.position,
      previousPosition: k.previousPosition,
      clicks: k.clicks,
      target_page: k.target_page
    }));

    // Moved up list: keywords that improved with old → new position
    const movedUpList = movedUp
      .sort((a, b) => (a.positionChange || 0) - (b.positionChange || 0)) // Most improved first
      .slice(0, 10) // Top 10
      .map(k => ({
        keyword: k.keyword,
        position: k.position,
        previousPosition: k.previousPosition,
        change: k.positionChange
      }));

    return new Response(JSON.stringify({
      keywords,
      pages,
      stats,
      opportunities,
      movedUpList,
      month,
      previousMonth
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching SEO data:', error);
    return new Response(JSON.stringify({
      keywords: [],
      pages: [],
      stats: { targetKeywords: 0, onPageOne: 0, closeToPageOne: 0, movedUp: 0, gaps: 0 },
      opportunities: [],
      movedUpList: [],
      month: null,
      previousMonth: null
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
