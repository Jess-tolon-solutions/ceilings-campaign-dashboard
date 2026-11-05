// GET /api/metrics - Returns metrics and summaries for all sources with previous month comparison
// POST /api/metrics - Admin-only: save LinkedIn metrics and summary (manual entry)
// Query param: ?month=YYYY-MM (defaults to most recent month with data)

interface Env {
  DB: D1Database;
  ADMIN_EMAILS?: string;
}

interface Data extends Record<string, unknown> {
  userEmail: string;
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

function isAdmin(email: string, adminEmails: string): boolean {
  const admins = adminEmails.split(',').map(e => e.trim().toLowerCase());
  return admins.includes(email.toLowerCase());
}

function getPreviousMonth(month: string): string {
  const [year, m] = month.split('-').map(Number);
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? year - 1 : year;
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
}

export const onRequestGet: PagesFunction<Env, string, Data> = async (context) => {
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
      return new Response(JSON.stringify({ metrics: {}, previousMetrics: {}, summaries: {}, month: null, previousMonth: null }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const previousMonth = getPreviousMonth(month);

    // Fetch metrics for current and previous month in parallel
    const [currentMetricsResult, previousMetricsResult, summariesResult] = await Promise.all([
      env.DB.prepare(`SELECT source, metric, value FROM metrics_monthly WHERE month = ?`).bind(month).all<MetricsRow>(),
      env.DB.prepare(`SELECT source, metric, value FROM metrics_monthly WHERE month = ?`).bind(previousMonth).all<MetricsRow>(),
      env.DB.prepare(`SELECT source, bullets FROM metrics_summary WHERE month = ?`).bind(month).all<SummaryRow>()
    ]);

    // Organize metrics by source
    const metrics: Record<string, Record<string, number>> = { gsc: {}, ga4: {}, facebook: {}, instagram: {}, linkedin: {} };
    const previousMetrics: Record<string, Record<string, number>> = { gsc: {}, ga4: {}, facebook: {}, instagram: {}, linkedin: {} };

    for (const row of currentMetricsResult.results || []) {
      if (!metrics[row.source]) metrics[row.source] = {};
      metrics[row.source][row.metric] = row.value;
    }

    for (const row of previousMetricsResult.results || []) {
      if (!previousMetrics[row.source]) previousMetrics[row.source] = {};
      previousMetrics[row.source][row.metric] = row.value;
    }

    // Organize summaries by source (parse JSON bullets)
    const summaries: Record<string, string[]> = { gsc: [], ga4: [], facebook: [], instagram: [], linkedin: [] };

    for (const row of summariesResult.results || []) {
      try {
        summaries[row.source] = JSON.parse(row.bullets);
      } catch {
        summaries[row.source] = [];
      }
    }

    return new Response(JSON.stringify({
      metrics,
      previousMetrics,
      summaries,
      month,
      previousMonth
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    return new Response(JSON.stringify({ metrics: {}, previousMetrics: {}, summaries: {}, month: null, previousMonth: null }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// POST /api/metrics - Admin-only: save meta metrics and summary
export const onRequestPost: PagesFunction<Env, string, Data> = async (context) => {
  const { env, request, data } = context;

  if (!isAdmin(data.userEmail, env.ADMIN_EMAILS || '')) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json() as {
      month: string;
      metrics: Record<string, number>;
      summary?: string[];
    };

    if (!body.month) {
      return new Response(JSON.stringify({ error: 'month is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // LinkedIn is the only manually-entered social source
    const source = 'linkedin';

    // Delete existing metrics for this month+source, then insert new ones
    await env.DB.prepare(`DELETE FROM metrics_monthly WHERE month = ? AND source = ?`)
      .bind(body.month, source).run();

    // Insert each metric
    if (body.metrics) {
      for (const [metric, value] of Object.entries(body.metrics)) {
        await env.DB.prepare(`
          INSERT INTO metrics_monthly (month, source, metric, value)
          VALUES (?, ?, ?, ?)
        `).bind(body.month, source, metric, value).run();
      }
    }

    // Upsert summary bullets
    if (body.summary && Array.isArray(body.summary)) {
      await env.DB.prepare(`
        INSERT INTO metrics_summary (month, source, bullets, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(month, source) DO UPDATE SET
          bullets = excluded.bullets,
          updated_at = datetime('now')
      `).bind(body.month, source, JSON.stringify(body.summary)).run();
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error saving metrics:', error);
    return new Response(JSON.stringify({ error: 'Failed to save metrics' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
