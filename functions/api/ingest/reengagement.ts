// POST /api/ingest/reengagement - Import CRU_Reengagement_Master.csv
// Groups by email, assigns status based on rules
// ?preview=true returns counts without inserting

interface Env {
  DB: D1Database;
}

interface CSVRow {
  'Client Name': string;
  'Email': string;
  'Phone': string;
  'Job Type': string;
  'Last Invoice Date': string;
  'Segment': string;
  'Campaign 1 (Sept)': string;
  'Round 2 (Nov)': string;
  'Round 2 Note': string;
  'Contacted': string;
  'Source': string;
  'Rows Sharing This Email': string;
}

interface GroupedContact {
  email: string;
  clientNames: string[];
  phone: string;
  jobType: string;
  lastInvoiceDate: string;
  segment: string;
  emailVersion: string;
  campaign1Status: string;
  round2Status: string;
  round2Note: string;
  contacted: boolean;
  source: string;
  rowsSharing: number;
  rawRows: CSVRow[];
  status: string;
  statusReason: string;
  badge: string;
  isBiloholding: boolean;
}

function parseCSV(text: string): CSVRow[] {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

  const rows: CSVRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    rows.push(row as unknown as CSVRow);
  }

  return rows;
}

function getEmailVersion(segment: string): string {
  switch (segment) {
    case 'Last 12 Months':
      return 'recent';
    case '1-3 Years':
      return 'lapsed';
    case '3+ Years':
    case 'Not in QBO list':
    default:
      return 'dormant';
  }
}

// Holds that mean we can't send
const CANT_SEND_HOLDS = [
  'outside service area',
  'billing inbox',
  'unknown contact',
  'corporate, not local',
  'corporate not local',
  'not a primary email',
  'duplicate org',
  'jess removed'
];

function determineStatus(row: CSVRow, isBiloholding: boolean): { status: string; reason: string; badge: string } {
  const campaign1 = row['Campaign 1 (Sept)'] || '';
  const round2 = (row['Round 2 (Nov)'] || '').toLowerCase();
  const contacted = row['Contacted'] === 'Yes';

  // Campaign 1 bounces → Can't email
  if (campaign1.includes('Bounced')) {
    return { status: 'cant_email', reason: 'Campaign 1 bounce', badge: '' };
  }

  // Biloholding → To review with badge (don't auto-assign)
  if (isBiloholding) {
    return { status: 'to_review', reason: '', badge: 'Check before approving' };
  }

  // Scheduled – Round 2 (Nov 5) → Already contacted
  if (round2.includes('scheduled')) {
    return { status: 'already_contacted', reason: 'Scheduled - Round 2 (Nov 5)', badge: 'Sent Nov 5' };
  }

  // Already contacted (Contacted = Yes) → Already contacted
  if (contacted) {
    return { status: 'already_contacted', reason: 'Marked as contacted', badge: '' };
  }

  // Check held statuses
  if (round2.includes('held')) {
    // Holds that mean we can't send → Can't email
    for (const cantSend of CANT_SEND_HOLDS) {
      if (round2.includes(cantSend)) {
        return { status: 'cant_email', reason: row['Round 2 (Nov)'], badge: '' };
      }
    }

    // "Held – warm tier" → To review with badge
    if (round2.includes('warm tier') || round2.includes('warm-tier')) {
      return { status: 'to_review', reason: row['Round 2 (Nov)'], badge: 'Warm-tier email' };
    }

    // "Held – needs Jonathan" → To review with badge
    if (round2.includes('needs jonathan')) {
      return { status: 'to_review', reason: row['Round 2 (Nov)'], badge: 'Your call' };
    }

    // "Held - already got Campaign 1" → Can't email (they were already sent Campaign 1)
    if (round2.includes('already got campaign 1')) {
      return { status: 'cant_email', reason: row['Round 2 (Nov)'], badge: '' };
    }

    // Any other hold → Can't email (safer default)
    return { status: 'cant_email', reason: row['Round 2 (Nov)'], badge: '' };
  }

  // Default → To review
  return { status: 'to_review', reason: '', badge: '' };
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  const url = new URL(request.url);
  const isPreview = url.searchParams.get('preview') === 'true';

  try {
    const text = await request.text();
    const rows = parseCSV(text);

    console.log(`[reengagement] Parsed ${rows.length} rows`);

    // Group by email (case-insensitive)
    const grouped = new Map<string, GroupedContact>();
    let skipped = 0;

    for (const row of rows) {
      const email = row['Email']?.trim();
      if (!email) {
        skipped++;
        continue; // Skip rows with no email
      }

      const emailLower = email.toLowerCase();
      const isBiloholding = emailLower.includes('bilohol');
      const { status, reason, badge } = determineStatus(row, isBiloholding);

      if (grouped.has(emailLower)) {
        // Add to existing group
        const existing = grouped.get(emailLower)!;
        existing.clientNames.push(row['Client Name']);
        existing.rawRows.push(row);

        // Use most recent invoice date
        if (row['Last Invoice Date'] > existing.lastInvoiceDate) {
          existing.lastInvoiceDate = row['Last Invoice Date'];
        }

        // Keep phone if we don't have one
        if (!existing.phone && row['Phone']) {
          existing.phone = row['Phone'];
        }

        // Aggregate status - prioritize cant_email > already_contacted > to_review
        // Note: not_now is only for Jonathan's manual picks, not from import
        const statusPriority: Record<string, number> = {
          cant_email: 3,
          already_contacted: 2,
          to_review: 1
        };
        if (statusPriority[status] > statusPriority[existing.status]) {
          existing.status = status;
          existing.statusReason = reason;
        }

        // Keep biloholding flag if any row has it
        if (isBiloholding) {
          existing.isBiloholding = true;
          existing.badge = 'Check before approving';
        }

        // Keep badge if we have one
        if (badge && !existing.badge) {
          existing.badge = badge;
        }
      } else {
        // Create new group
        grouped.set(emailLower, {
          email: email,
          clientNames: [row['Client Name']],
          phone: row['Phone'] || '',
          jobType: row['Job Type'] || '',
          lastInvoiceDate: row['Last Invoice Date'] || '',
          segment: row['Segment'] || '',
          emailVersion: getEmailVersion(row['Segment'] || ''),
          campaign1Status: row['Campaign 1 (Sept)'] || '',
          round2Status: row['Round 2 (Nov)'] || '',
          round2Note: row['Round 2 Note'] || '',
          contacted: row['Contacted'] === 'Yes',
          source: row['Source'] || '',
          rowsSharing: parseInt(row['Rows Sharing This Email'] || '1', 10),
          rawRows: [row],
          status,
          statusReason: reason,
          badge,
          isBiloholding
        });
      }
    }

    console.log(`[reengagement] Grouped into ${grouped.size} unique emails, skipped ${skipped}`);

    // Count by status for preview
    const statusCounts: Record<string, number> = {
      to_review: 0,
      approved: 0,
      not_now: 0,
      already_contacted: 0,
      cant_email: 0
    };
    let biloholdingCount = 0;

    for (const contact of grouped.values()) {
      statusCounts[contact.status] = (statusCounts[contact.status] || 0) + 1;
      if (contact.isBiloholding) biloholdingCount++;
    }

    // Load existing decisions from old clients table (needed for both preview and import)
    const oldDecisions = new Map<string, { decision: string; do_not_send: number; hold: number }>();
    let oldClientsCount = 0;
    try {
      const oldClientsResult = await env.DB.prepare(`
        SELECT c.email, cs.decision, c.do_not_send, c.hold
        FROM clients c
        LEFT JOIN campaign_selections cs ON c.id = cs.client_id
        WHERE c.email IS NOT NULL AND c.email != ''
      `).all();

      for (const row of oldClientsResult.results as { email: string; decision: string; do_not_send: number; hold: number }[]) {
        if (row.email) {
          const emailLower = row.email.toLowerCase();
          // Keep the most restrictive decision
          const existing = oldDecisions.get(emailLower);
          if (!existing || (row.do_not_send && !existing.do_not_send) || (row.hold && !existing.hold)) {
            oldDecisions.set(emailLower, row);
          }
        }
      }
      oldClientsCount = oldDecisions.size;
      console.log(`[reengagement] Loaded ${oldDecisions.size} existing decisions`);
    } catch (e) {
      console.log('[reengagement] No existing clients table or decisions');
    }

    // Count how many will have decisions carried over
    let decisionsToCarryOver = 0;
    for (const contact of grouped.values()) {
      const emailLower = contact.email.toLowerCase();
      const oldData = oldDecisions.get(emailLower);
      if (oldData && (oldData.decision || oldData.do_not_send || oldData.hold)) {
        decisionsToCarryOver++;
      }
    }

    // If preview mode, return counts without inserting
    if (isPreview) {
      return new Response(JSON.stringify({
        preview: true,
        totalRows: rows.length,
        skipped,
        uniqueEmails: grouped.size,
        statusCounts,
        biloholdingFlagged: biloholdingCount,
        oldClientsFound: oldClientsCount,
        decisionsToCarryOver,
        message: `Preview: ${skipped} skipped (no email), ${grouped.size} unique emails. Tab breakdown: To review: ${statusCounts.to_review}, Already contacted: ${statusCounts.already_contacted}, Can't email: ${statusCounts.cant_email}. Biloholding entries: ${biloholdingCount} (placed in To review with badge). Old decisions to carry over: ${decisionsToCarryOver}.`
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Archive old tables
    try {
      await env.DB.prepare(`INSERT INTO clients_archive SELECT * FROM clients`).run();
      await env.DB.prepare(`INSERT INTO campaign_selections_archive SELECT * FROM campaign_selections`).run();
      console.log('[reengagement] Archived old clients and selections');
    } catch (e) {
      console.log('[reengagement] Could not archive (tables may not exist)');
    }

    // Clear existing reengagement data and insert new
    await env.DB.prepare('DELETE FROM reengagement_contacts').run();

    let inserted = 0;
    let decisionsCarriedOver = 0;

    const insertStmt = env.DB.prepare(`
      INSERT INTO reengagement_contacts (
        email, client_names, phone, job_type, last_invoice_date,
        segment, email_version, status, status_reason, badge,
        campaign1_status, campaign1_sent, round2_status, round2_note,
        old_decision, do_not_send, hold,
        contacted, source, rows_sharing_email, raw_rows, is_biloholding
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const contact of grouped.values()) {
      const campaign1Sent = contact.campaign1Status ? 1 : 0;
      const emailLower = contact.email.toLowerCase();
      const oldData = oldDecisions.get(emailLower);

      let oldDecision = '';
      let doNotSend = 0;
      let hold = 0;

      if (oldData) {
        oldDecision = oldData.decision || '';
        doNotSend = oldData.do_not_send || 0;
        hold = oldData.hold || 0;
        if (oldDecision || doNotSend || hold) {
          decisionsCarriedOver++;
        }
      }

      await insertStmt.bind(
        contact.email,
        JSON.stringify(contact.clientNames),
        contact.phone,
        contact.jobType,
        contact.lastInvoiceDate,
        contact.segment,
        contact.emailVersion,
        contact.status,
        contact.statusReason,
        contact.badge,
        contact.campaign1Status,
        campaign1Sent,
        contact.round2Status,
        contact.round2Note,
        oldDecision,
        doNotSend,
        hold,
        contact.contacted ? 1 : 0,
        contact.source,
        contact.rawRows.length,
        JSON.stringify(contact.rawRows),
        contact.isBiloholding ? 1 : 0
      ).run();
      inserted++;
    }

    return new Response(JSON.stringify({
      success: true,
      imported: inserted,
      skipped,
      statusCounts,
      biloholdingFlagged: biloholdingCount,
      decisionsCarriedOver,
      message: `Imported ${inserted} contacts. ${skipped} rows skipped (no email). ${decisionsCarriedOver} decisions carried over from previous data.`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[reengagement] Import error:', error);
    return new Response(JSON.stringify({
      error: 'Import failed',
      details: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
