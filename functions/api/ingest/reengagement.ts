// POST /api/ingest/reengagement - Import CRU_Reengagement_Master.csv
// Groups by email, assigns status based on rules

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

function determineStatus(row: CSVRow): { status: string; reason: string } {
  const campaign1 = row['Campaign 1 (Sept)'] || '';
  const round2 = row['Round 2 (Nov)'] || '';
  const contacted = row['Contacted'] === 'Yes';

  // Campaign 1 bounces → Can't email
  if (campaign1.includes('Bounced')) {
    return { status: 'cant_email', reason: 'Campaign 1 bounce' };
  }

  // Already contacted → Already contacted tab
  if (contacted) {
    return { status: 'already_contacted', reason: 'Marked as contacted' };
  }

  // Any hold status → Not now
  if (round2.includes('Held')) {
    return { status: 'not_now', reason: round2 };
  }

  // Scheduled for Round 2 → Approved
  if (round2.includes('Scheduled')) {
    return { status: 'approved', reason: round2 };
  }

  // Default → To review
  return { status: 'to_review', reason: '' };
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, request } = context;

  try {
    const text = await request.text();
    const rows = parseCSV(text);

    console.log(`[reengagement] Parsed ${rows.length} rows`);

    // Group by email (case-insensitive)
    const grouped = new Map<string, GroupedContact>();

    for (const row of rows) {
      const email = row['Email']?.trim();
      if (!email) {
        continue; // Skip rows with no email
      }

      const emailLower = email.toLowerCase();
      const { status, reason } = determineStatus(row);
      const isBiloholding = emailLower.includes('bilohol');

      if (grouped.has(emailLower)) {
        // Add to existing group
        const existing = grouped.get(emailLower)!;
        existing.clientNames.push(row['Client Name']);
        existing.rawRows.push(row);

        // Use most recent invoice date
        if (row['Last Invoice Date'] > existing.lastInvoiceDate) {
          existing.lastInvoiceDate = row['Last Invoice Date'];
        }

        // Aggregate status - prioritize cant_email > already_contacted > not_now > approved > to_review
        const statusPriority: Record<string, number> = {
          cant_email: 5,
          already_contacted: 4,
          not_now: 3,
          approved: 2,
          to_review: 1
        };
        if (statusPriority[status] > statusPriority[existing.status]) {
          existing.status = status;
          existing.statusReason = reason;
        }

        // Keep biloholding flag if any row has it
        if (isBiloholding) {
          existing.isBiloholding = true;
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
          isBiloholding
        });
      }
    }

    console.log(`[reengagement] Grouped into ${grouped.size} unique emails`);

    // Clear existing data and insert new
    await env.DB.prepare('DELETE FROM reengagement_contacts').run();

    let inserted = 0;
    const insertStmt = env.DB.prepare(`
      INSERT INTO reengagement_contacts (
        email, client_names, phone, job_type, last_invoice_date,
        segment, email_version, status, status_reason,
        campaign1_status, campaign1_sent, round2_status, round2_note,
        contacted, source, rows_sharing_email, raw_rows, is_biloholding
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const contact of grouped.values()) {
      const campaign1Sent = contact.campaign1Status ? 1 : 0;

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
        contact.campaign1Status,
        campaign1Sent,
        contact.round2Status,
        contact.round2Note,
        contact.contacted ? 1 : 0,
        contact.source,
        contact.rawRows.length,
        JSON.stringify(contact.rawRows),
        contact.isBiloholding ? 1 : 0
      ).run();
      inserted++;
    }

    // Count by status
    const counts = await env.DB.prepare(`
      SELECT status, COUNT(*) as count FROM reengagement_contacts GROUP BY status
    `).all();

    const statusCounts: Record<string, number> = {};
    for (const row of counts.results as { status: string; count: number }[]) {
      statusCounts[row.status] = row.count;
    }

    // Count biloholding
    const biloholdingCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM reengagement_contacts WHERE is_biloholding = 1
    `).first<{ count: number }>();

    return new Response(JSON.stringify({
      success: true,
      imported: inserted,
      skipped: rows.length - Array.from(grouped.values()).reduce((sum, g) => sum + g.rawRows.length, 0),
      statusCounts,
      biloholdingFlagged: biloholdingCount?.count || 0
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
