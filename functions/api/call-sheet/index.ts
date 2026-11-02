// GET /api/call-sheet - Returns call sheet for dashboard
// Query params: ?week=YYYY-MM-DD (defaults to current week)

interface Env {
  DB: D1Database;
  WEEKLY_ASSIGNMENTS?: string; // Default number of assignments per week
}

interface CallSheetRow {
  id: number;
  week_start: string;
  rank: number | null;
  business_name: string;
  tier: string | null;
  venue_type: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  phone: string | null;
  ask_for: string | null;
  seats: number | null;
  owner_mail_address: string | null;
  best_time: string | null;
  hours: string | null;
  dbpr_license: string;
  signal_score: number | null;
  v36_count: number;
  high_priority_count: number;
  total_violations: number;
  enforcement_status: string | null;
  last_inspection_date: string | null;
  open_case: number;
  look_at: string | null;
  touches: number;
  last_touch_at: string | null;
  status: string;
  outcome_note: string | null;
  outcome_by: string | null;
  on_postcard_list: number;
}

// Get Monday of current week
function getCurrentWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().slice(0, 10);
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  try {
    const weekStart = url.searchParams.get('week') || getCurrentWeekStart();
    const weeklyLimit = parseInt(env.WEEKLY_ASSIGNMENTS || '3', 10);

    // Get all records for this week
    const allResult = await env.DB.prepare(`
      SELECT *
      FROM call_sheet
      WHERE week_start = ?
      ORDER BY signal_score DESC, rank ASC
    `).bind(weekStart).all<CallSheetRow>();

    const allLeads = allResult.results || [];

    // "Your 3 this week": top N businesses that have had touch 1+,
    // excluding not_interested, closed*, do_not_contact
    // Rank by signal_score
    const excludeStatuses = ['not_interested', 'closed', 'closed_gone', 'do_not_contact'];
    const assignedThisWeek = allLeads
      .filter(lead =>
        lead.touches >= 1 &&
        !excludeStatuses.includes(lead.status)
      )
      .sort((a, b) => (b.signal_score || 0) - (a.signal_score || 0))
      .slice(0, weeklyLimit);

    // Pipeline counts
    const pipeline = {
      open: allLeads.filter(l => l.status === 'open').length,
      visited: allLeads.filter(l => l.status === 'visited').length,
      called: allLeads.filter(l => l.status === 'called').length,
      won: allLeads.filter(l => l.status === 'won').length,
      not_interested: allLeads.filter(l => l.status === 'not_interested').length,
      closed: allLeads.filter(l => ['closed', 'closed_gone'].includes(l.status)).length,
      do_not_contact: allLeads.filter(l => l.status === 'do_not_contact').length
    };

    return new Response(JSON.stringify({
      weekStart,
      weeklyLimit,
      assignedThisWeek,
      allLeads,
      pipeline
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching call sheet:', error);
    return new Response(JSON.stringify({
      weekStart: getCurrentWeekStart(),
      weeklyLimit: 3,
      assignedThisWeek: [],
      allLeads: [],
      pipeline: { open: 0, visited: 0, called: 0, won: 0, not_interested: 0, closed: 0, do_not_contact: 0 }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
