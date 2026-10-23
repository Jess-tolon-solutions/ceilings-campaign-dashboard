// POST /api/ingest/:source - Receive data from producer repos
// Auth: Cloudflare Access service token (CF-Access-Client-Id / CF-Access-Client-Secret)

interface Env {
  DB: D1Database;
}

interface Data {
  userEmail: string;
}

type IngestSource = 'clients' | 'violations' | 'mail_list_b' | 'gsc' | 'ga4' | 'meta';

export const onRequestPost: PagesFunction<Env, string, Data> = async (context) => {
  const { env, params, request, data } = context;
  const source = params.source as IngestSource;

  const validSources: IngestSource[] = ['clients', 'violations', 'mail_list_b', 'gsc', 'ga4', 'meta'];
  if (!validSources.includes(source)) {
    return new Response(JSON.stringify({ error: `Invalid source: ${source}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const rows = await request.json() as Record<string, any>[];

    if (!Array.isArray(rows)) {
      return new Response(JSON.stringify({ error: 'Payload must be an array' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let inserted = 0;
    let updated = 0;

    switch (source) {
      case 'clients':
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

      case 'violations':
        // Arm A: DBPR ceiling violations
        for (const row of rows) {
          await env.DB.prepare(`
            INSERT INTO mail_drops (campaign_id, arm, list_source, business_name, address, county, violation_date, violation_type, tracking_code)
            VALUES (
              (SELECT id FROM campaigns WHERE channel = 'direct_mail' AND status = 'active' ORDER BY id DESC LIMIT 1),
              'A_violation_business',
              ?, ?, ?, ?, ?, ?, ?
            )
          `).bind(
            row.list_source || 'DBPR',
            row.business_name,
            row.address,
            row.county,
            row.violation_date,
            row.violation_type,
            row.tracking_code
          ).run();
          inserted++;
        }
        break;

      case 'mail_list_b':
        // Arm B: New address per location
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

      case 'gsc':
      case 'ga4':
      case 'meta':
        for (const row of rows) {
          await env.DB.prepare(`
            INSERT INTO metrics_monthly (month, source, metric, dimension, value)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(month, source, metric, dimension) DO UPDATE SET
              value = excluded.value
          `).bind(
            row.month,
            source,
            row.metric,
            row.dimension || null,
            row.value
          ).run();
          inserted++;
        }
        break;
    }

    // Log the ingest
    await env.DB.prepare(`
      INSERT INTO audit_log (actor, action, entity, payload)
      VALUES (?, ?, ?, ?)
    `).bind(
      data.userEmail,
      'ingest',
      source,
      JSON.stringify({ rows: rows.length, inserted, updated })
    ).run();

    return new Response(JSON.stringify({
      success: true,
      source,
      rows: rows.length,
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
