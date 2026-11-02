// POST /api/ingest/:source - Receive data from producer repos
// Auth: Cloudflare Access service token (CF-Access-Client-Id / CF-Access-Client-Secret)

interface Env {
  DB: D1Database;
}

interface Data extends Record<string, unknown> {
  userEmail: string;
}

type IngestSource = 'clients' | 'violations' | 'mail_list_b' | 'gsc' | 'ga4' | 'meta' | 'seo_keywords' | 'seo_pages';

// Payload for gsc/ga4/meta: { month, metrics: {name: value}, summary: [bullet1, bullet2, bullet3] }
interface MetricsPayload {
  month: string;
  metrics: Record<string, number>;
  summary?: string[];
}

// Payload for seo_keywords: array of keyword rows
interface KeywordRow {
  month: string;
  keyword: string;
  target_page?: string;
  position?: number;
  clicks?: number;
  impressions?: number;
  tracked?: boolean; // true = target keyword, false = untracked query
}

// Payload for seo_pages: array of page rows
interface PageRow {
  month: string;
  url: string;
  clicks?: number;
  top_query?: string;
  index_status?: string;
}

export const onRequestPost: PagesFunction<Env, string, Data> = async (context) => {
  const { env, params, request, data } = context;
  const source = params.source as IngestSource;

  const validSources: IngestSource[] = ['clients', 'violations', 'mail_list_b', 'gsc', 'ga4', 'meta', 'seo_keywords', 'seo_pages'];
  if (!validSources.includes(source)) {
    return new Response(JSON.stringify({ error: `Invalid source: ${source}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json();
    let inserted = 0;
    let updated = 0;

    switch (source) {
      case 'clients': {
        const rows = body as Record<string, any>[];
        if (!Array.isArray(rows)) {
          return new Response(JSON.stringify({ error: 'Payload must be an array' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        for (const row of rows) {
          const result = await env.DB.prepare(`
            INSERT INTO clients (company, contact_name, title, email, phone, address, city, county, segment, locations_count, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(email, company) DO UPDATE SET
              contact_name = excluded.contact_name,
              title = excluded.title,
              phone = excluded.phone,
              address = excluded.address,
              city = excluded.city,
              county = excluded.county,
              segment = excluded.segment,
              locations_count = excluded.locations_count,
              updated_at = datetime('now')
          `).bind(
            row.company,
            row.contact_name,
            row.title,
            row.email,
            row.phone,
            row.address,
            row.city,
            row.county,
            row.segment,
            row.locations_count || 1,
            row.source || 'import'
          ).run();
          if (result.meta.changes > 0) inserted++;
        }
        break;
      }

      case 'violations': {
        const rows = body as Record<string, any>[];
        if (!Array.isArray(rows)) {
          return new Response(JSON.stringify({ error: 'Payload must be an array' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        for (const row of rows) {
          await env.DB.prepare(`
            INSERT INTO mail_drops (campaign_id, arm, list_source, business_name, address, county, violation_date, violation_type, tracking_code, dbpr_license)
            VALUES (
              (SELECT id FROM campaigns WHERE channel = 'direct_mail' AND status = 'active' ORDER BY id DESC LIMIT 1),
              'A_violation_business',
              ?, ?, ?, ?, ?, ?, ?, ?
            )
          `).bind(
            row.list_source || 'DBPR',
            row.business_name,
            row.address,
            row.county,
            row.violation_date,
            row.violation_type,
            row.tracking_code,
            row.dbpr_license || null
          ).run();
          inserted++;
        }
        break;
      }

      case 'mail_list_b': {
        const rows = body as Record<string, any>[];
        if (!Array.isArray(rows)) {
          return new Response(JSON.stringify({ error: 'Payload must be an array' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        for (const row of rows) {
          await env.DB.prepare(`
            INSERT INTO mail_drops (campaign_id, arm, list_source, business_name, address, county, tracking_code)
            VALUES (
              (SELECT id FROM campaigns WHERE channel = 'direct_mail' AND status = 'active' ORDER BY id DESC LIMIT 1),
              'B_new_address_per_location',
              ?, ?, ?, ?, ?
            )
          `).bind(
            row.list_source || 'location_pull',
            row.business_name,
            row.address,
            row.county,
            row.tracking_code
          ).run();
          inserted++;
        }
        break;
      }

      case 'gsc':
      case 'ga4':
      case 'meta': {
        // Payload: { month: "2024-10", metrics: { clicks: 123, ... }, summary: ["bullet1", "bullet2", "bullet3"] }
        const payload = body as MetricsPayload;

        if (!payload.month) {
          return new Response(JSON.stringify({ error: 'month is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Delete existing metrics for this month+source, then insert new ones
        await env.DB.prepare(`DELETE FROM metrics_monthly WHERE month = ? AND source = ?`)
          .bind(payload.month, source).run();

        // Insert each metric
        if (payload.metrics) {
          for (const [metric, value] of Object.entries(payload.metrics)) {
            await env.DB.prepare(`
              INSERT INTO metrics_monthly (month, source, metric, value)
              VALUES (?, ?, ?, ?)
            `).bind(payload.month, source, metric, value).run();
            inserted++;
          }
        }

        // Upsert summary bullets
        if (payload.summary && Array.isArray(payload.summary)) {
          await env.DB.prepare(`
            INSERT INTO metrics_summary (month, source, bullets, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(month, source) DO UPDATE SET
              bullets = excluded.bullets,
              updated_at = datetime('now')
          `).bind(payload.month, source, JSON.stringify(payload.summary)).run();
        }
        break;
      }

      case 'seo_keywords': {
        const rows = body as KeywordRow[];
        if (!Array.isArray(rows)) {
          return new Response(JSON.stringify({ error: 'Payload must be an array' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        for (const row of rows) {
          if (!row.month || !row.keyword) {
            continue; // Skip invalid rows
          }
          // tracked: true (default) = target keyword, false = untracked query from GSC
          const tracked = row.tracked !== false ? 1 : 0;
          await env.DB.prepare(`
            INSERT INTO seo_keywords (month, keyword, target_page, position, clicks, impressions, tracked)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(month, keyword) DO UPDATE SET
              target_page = excluded.target_page,
              position = excluded.position,
              clicks = excluded.clicks,
              impressions = excluded.impressions,
              tracked = excluded.tracked
          `).bind(
            row.month,
            row.keyword,
            row.target_page || null,
            row.position || null,
            row.clicks || null,
            row.impressions || null,
            tracked
          ).run();
          inserted++;
        }
        break;
      }

      case 'seo_pages': {
        const rows = body as PageRow[];
        if (!Array.isArray(rows)) {
          return new Response(JSON.stringify({ error: 'Payload must be an array' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        for (const row of rows) {
          if (!row.month || !row.url) {
            continue; // Skip invalid rows
          }
          await env.DB.prepare(`
            INSERT INTO seo_pages (month, url, clicks, top_query, index_status)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(month, url) DO UPDATE SET
              clicks = excluded.clicks,
              top_query = excluded.top_query,
              index_status = excluded.index_status
          `).bind(
            row.month,
            row.url,
            row.clicks || null,
            row.top_query || null,
            row.index_status || null
          ).run();
          inserted++;
        }
        break;
      }
    }

    // Log the ingest
    await env.DB.prepare(`
      INSERT INTO audit_log (actor, action, entity, payload)
      VALUES (?, ?, ?, ?)
    `).bind(
      data.userEmail,
      'ingest',
      source,
      JSON.stringify({ inserted, updated })
    ).run();

    return new Response(JSON.stringify({
      success: true,
      source,
      inserted,
      updated
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error(`Ingest failed for ${source}:`, error);
    return new Response(JSON.stringify({ error: `Ingest failed: ${error}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
