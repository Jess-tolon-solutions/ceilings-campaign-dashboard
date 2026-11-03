// GET /api/metrics - Returns metrics and summaries for all sources
// Query param: ?month=YYYY-MM (defaults to most recent month with data)

interface Env {
  DB: D1Database;
}

interface MetricsRow {
  source: string;
  metric: string;
  value: number;
}

interface SummaryRow {
  source: string;
  bullets: string;
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
        SELECT month FROM metrics_monthly ORDER BY month DESC LIMIT 1
      `).first<MonthRow>();
      month = recentResult?.month || '';
    }

    if (!month) {
      return new Response(JSON.stringify({ metrics: {}, summaries: {}, month: null }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch metrics for month
    const metricsResult = await env.DB.prepare(`
      SELECT source, metric, value
      FROM metrics_monthly
      WHERE month = ?
    `).bind(month).all<MetricsRow>();

    // Fetch summaries for month
    const summariesResult = await env.DB.prepare(`
      SELECT source, bullets
      FROM metrics_summary
      WHERE month = ?
    `).bind(month).all<SummaryRow>();

    // Organize metrics by source
    const metrics: Record<string, Record<string, number>> = {
      gsc: {},
      ga4: {},
      meta: {}
    };

    for (const row of metricsResult.results || []) {
      if (!metrics[row.source]) {
        metrics[row.source] = {};
      }
      metrics[row.source][row.metric] = row.value;
    }

    // Organize summaries by source (parse JSON bullets)
    const summaries: Record<string, string[]> = {
      gsc: [],
      ga4: [],
      meta: []
    };

    for (const row of summariesResult.results || []) {
      try {
        summaries[row.source] = JSON.parse(row.bullets);
      } catch {
        summaries[row.source] = [];
      }
    }

    console.log('Metrics API returning:', { month, metricsCount: Object.keys(metrics.ga4 || {}).length + Object.keys(metrics.gsc || {}).length });
    return new Response(JSON.stringify({
      metrics,
      summaries,
      month
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    return new Response(JSON.stringify({ metrics: {}, summaries: {}, month: null }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
