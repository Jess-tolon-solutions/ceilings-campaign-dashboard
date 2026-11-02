// GET /api/metrics - Returns metrics and summaries for all sources

interface Env {
  DB: D1Database;
}

interface MetricsRow {
  source: string;
  metric_key: string;
  metric_value: number;
}

interface SummaryRow {
  source: string;
  bullets: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env } = context;

  try {
    // Get current month in YYYY-MM format
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Fetch metrics for current month
    const metricsResult = await env.DB.prepare(`
      SELECT source, metric_key, metric_value
      FROM metrics_monthly
      WHERE month = ?
    `).bind(currentMonth).all<MetricsRow>();

    // Fetch summaries for current month
    const summariesResult = await env.DB.prepare(`
      SELECT source, bullets
      FROM metrics_summary
      WHERE month = ?
    `).bind(currentMonth).all<SummaryRow>();

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
      metrics[row.source][row.metric_key] = row.metric_value;
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

    return new Response(JSON.stringify({
      metrics,
      summaries
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    return new Response(JSON.stringify({ metrics: {}, summaries: {} }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
