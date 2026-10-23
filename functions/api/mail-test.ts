// GET /api/mail-test - Get A/B test statistics for direct mail

interface Env {
  DB: D1Database;
}

interface Data {
  userEmail: string;
}

interface ArmStats {
  mailed: number;
  responses: number;
  responseRate: number;
  booked: number;
  costPerResponse: number;
  missingTracking: number;
}

// Minimum responses needed per arm to declare a winner
const MIN_RESPONSES_FOR_SIGNIFICANCE = 30;

// Estimated cost per piece mailed
const COST_PER_PIECE = 1.50;

export const onRequestGet: PagesFunction<Env, string, Data> = async (context) => {
  const { env } = context;

  try {
    // Get Arm A stats (violation businesses)
    const armAMailed = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM mail_drops WHERE arm = 'A_violation_business'
    `).first();

    const armAMissingTracking = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM mail_drops
      WHERE arm = 'A_violation_business' AND (tracking_code IS NULL OR tracking_code = '')
    `).first();

    const armAResponses = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM responses r
      JOIN mail_drops md ON r.mail_drop_id = md.id
      WHERE md.arm = 'A_violation_business'
    `).first();

    const armABooked = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM responses r
      JOIN mail_drops md ON r.mail_drop_id = md.id
      WHERE md.arm = 'A_violation_business' AND r.response_type = 'booked_job'
    `).first();

    // Get Arm B stats (new address per location)
    const armBMailed = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM mail_drops WHERE arm = 'B_new_address_per_location'
    `).first();

    const armBMissingTracking = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM mail_drops
      WHERE arm = 'B_new_address_per_location' AND (tracking_code IS NULL OR tracking_code = '')
    `).first();

    const armBResponses = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM responses r
      JOIN mail_drops md ON r.mail_drop_id = md.id
      WHERE md.arm = 'B_new_address_per_location'
    `).first();

    const armBBooked = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM responses r
      JOIN mail_drops md ON r.mail_drop_id = md.id
      WHERE md.arm = 'B_new_address_per_location' AND r.response_type = 'booked_job'
    `).first();

    // Calculate stats
    const armAMailedCount = (armAMailed?.count as number) || 0;
    const armAResponseCount = (armAResponses?.count as number) || 0;
    const armABookedCount = (armABooked?.count as number) || 0;

    const armBMailedCount = (armBMailed?.count as number) || 0;
    const armBResponseCount = (armBResponses?.count as number) || 0;
    const armBBookedCount = (armBBooked?.count as number) || 0;

    const armA: ArmStats = {
      mailed: armAMailedCount,
      responses: armAResponseCount,
      responseRate: armAMailedCount > 0 ? Math.round((armAResponseCount / armAMailedCount) * 10000) / 100 : 0,
      booked: armABookedCount,
      costPerResponse: armAResponseCount > 0 ? Math.round((armAMailedCount * COST_PER_PIECE / armAResponseCount) * 100) / 100 : 0,
      missingTracking: (armAMissingTracking?.count as number) || 0
    };

    const armB: ArmStats = {
      mailed: armBMailedCount,
      responses: armBResponseCount,
      responseRate: armBMailedCount > 0 ? Math.round((armBResponseCount / armBMailedCount) * 10000) / 100 : 0,
      booked: armBBookedCount,
      costPerResponse: armBResponseCount > 0 ? Math.round((armBMailedCount * COST_PER_PIECE / armBResponseCount) * 100) / 100 : 0,
      missingTracking: (armBMissingTracking?.count as number) || 0
    };

    // Determine if we can declare a winner
    const canDeclareWinner = armAResponseCount >= MIN_RESPONSES_FOR_SIGNIFICANCE &&
                             armBResponseCount >= MIN_RESPONSES_FOR_SIGNIFICANCE;

    let winner = '';
    if (canDeclareWinner) {
      if (armA.responseRate > armB.responseRate) {
        winner = 'Arm A (Business Violation List)';
      } else if (armB.responseRate > armA.responseRate) {
        winner = 'Arm B (New Address Per Location)';
      } else {
        winner = 'Tie';
      }
    }

    return new Response(JSON.stringify({
      armA,
      armB,
      canDeclareWinner,
      winner
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Failed to load mail test data:', error);
    return new Response(JSON.stringify({ error: 'Failed to load mail test data' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
