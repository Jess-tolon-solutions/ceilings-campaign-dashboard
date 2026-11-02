// POST /api/ingest/call_sheet - Upsert call sheet data
// Auth: Middleware validates Cf-Access-Jwt-Assertion
// Never overwrites: touches, last_touch_at, status, outcome_note, outcome_by

interface Env {
  DB: D1Database;
}

interface CallSheetRow {
  week_start: string;
  rank?: number;
  business_name: string;
  tier?: 'DRIVE' | 'REMOTE';
  venue_type?: string;
  address?: string;
  city?: string;
  zip?: string;
  phone?: string;
  ask_for?: string;
  seats?: number;
  owner_mail_address?: string;
  best_time?: string;
  hours?: string;
  dbpr_license: string;
  signal_score?: number;
  v36_count?: number;
  high_priority_count?: number;
  total_violations?: number;
  enforcement_status?: string;
  last_inspection_date?: string;
  open_case?: number;
  look_at?: string;
}

interface PayloadData extends Record<string, unknown> {
  rows: CallSheetRow[];
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    const data: PayloadData = await request.json();
    const rows = data.rows || [];

    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: 'No rows provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let inserted = 0;
    let updated = 0;

    for (const row of rows) {
      if (!row.dbpr_license || !row.week_start || !row.business_name) {
        continue; // Skip invalid rows
      }

      // Check if record exists
      const existing = await env.DB.prepare(`
        SELECT id, touches, last_touch_at, status, outcome_note, outcome_by
        FROM call_sheet
        WHERE dbpr_license = ? AND week_start = ?
      `).bind(row.dbpr_license, row.week_start).first();

      if (existing) {
        // Update, preserving dashboard-managed fields
        await env.DB.prepare(`
          UPDATE call_sheet SET
            rank = ?,
            business_name = ?,
            tier = ?,
            venue_type = ?,
            address = ?,
            city = ?,
            zip = ?,
            phone = ?,
            ask_for = ?,
            seats = ?,
            owner_mail_address = ?,
            best_time = ?,
            hours = ?,
            signal_score = ?,
            v36_count = ?,
            high_priority_count = ?,
            total_violations = ?,
            enforcement_status = ?,
            last_inspection_date = ?,
            open_case = ?,
            look_at = ?,
            updated_at = datetime('now')
          WHERE dbpr_license = ? AND week_start = ?
        `).bind(
          row.rank ?? null,
          row.business_name,
          row.tier ?? null,
          row.venue_type ?? null,
          row.address ?? null,
          row.city ?? null,
          row.zip ?? null,
          row.phone ?? null,
          row.ask_for ?? null,
          row.seats ?? null,
          row.owner_mail_address ?? null,
          row.best_time ?? null,
          row.hours ?? null,
          row.signal_score ?? null,
          row.v36_count ?? 0,
          row.high_priority_count ?? 0,
          row.total_violations ?? 0,
          row.enforcement_status ?? null,
          row.last_inspection_date ?? null,
          row.open_case ?? 0,
          row.look_at ?? null,
          row.dbpr_license,
          row.week_start
        ).run();
        updated++;
      } else {
        // Insert new record (on_postcard_list computed at read time from mail_drops)
        await env.DB.prepare(`
          INSERT INTO call_sheet (
            week_start, rank, business_name, tier, venue_type, address, city, zip,
            phone, ask_for, seats, owner_mail_address, best_time, hours, dbpr_license,
            signal_score, v36_count, high_priority_count, total_violations,
            enforcement_status, last_inspection_date, open_case, look_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          row.week_start,
          row.rank ?? null,
          row.business_name,
          row.tier ?? null,
          row.venue_type ?? null,
          row.address ?? null,
          row.city ?? null,
          row.zip ?? null,
          row.phone ?? null,
          row.ask_for ?? null,
          row.seats ?? null,
          row.owner_mail_address ?? null,
          row.best_time ?? null,
          row.hours ?? null,
          row.dbpr_license,
          row.signal_score ?? null,
          row.v36_count ?? 0,
          row.high_priority_count ?? 0,
          row.total_violations ?? 0,
          row.enforcement_status ?? null,
          row.last_inspection_date ?? null,
          row.open_case ?? 0,
          row.look_at ?? null
        ).run();
        inserted++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      inserted,
      updated,
      total: rows.length
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error ingesting call sheet:', error);
    return new Response(JSON.stringify({ error: 'Failed to ingest call sheet data' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
