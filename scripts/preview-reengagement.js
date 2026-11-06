#!/usr/bin/env node
// Preview re-engagement import - applies status rules without writing to DB

const fs = require('fs');
const path = require('path');

const CSV_PATH = process.argv[2] || path.join(process.env.HOME, 'Downloads', 'CRU_Reengagement_Master.csv');

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

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = [];
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

    const row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    rows.push(row);
  }

  return rows;
}

function getEmailVersion(segment) {
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

function determineStatus(row, isBiloholding) {
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

    // "Held - already got Campaign 1" → Can't email
    if (round2.includes('already got campaign 1')) {
      return { status: 'cant_email', reason: row['Round 2 (Nov)'], badge: '' };
    }

    // Any other hold → Can't email (safer default)
    return { status: 'cant_email', reason: row['Round 2 (Nov)'], badge: '' };
  }

  // Default → To review
  return { status: 'to_review', reason: '', badge: '' };
}

// Main
const text = fs.readFileSync(CSV_PATH, 'utf-8');
const rows = parseCSV(text);

console.log(`\n📊 RE-ENGAGEMENT IMPORT PREVIEW`);
console.log(`================================`);
console.log(`CSV file: ${CSV_PATH}`);
console.log(`Total rows: ${rows.length}`);

// Group by email
const grouped = new Map();
let skipped = 0;

for (const row of rows) {
  const email = row['Email']?.trim();
  if (!email) {
    skipped++;
    continue;
  }

  const emailLower = email.toLowerCase();
  const isBiloholding = emailLower.includes('bilohol');
  const { status, reason, badge } = determineStatus(row, isBiloholding);

  if (grouped.has(emailLower)) {
    const existing = grouped.get(emailLower);
    existing.clientNames.push(row['Client Name']);
    existing.rawRows.push(row);

    // Use most recent invoice date
    if (row['Last Invoice Date'] > existing.lastInvoiceDate) {
      existing.lastInvoiceDate = row['Last Invoice Date'];
    }

    // Aggregate status - prioritize cant_email > already_contacted > to_review
    const statusPriority = { cant_email: 3, already_contacted: 2, to_review: 1 };
    if (statusPriority[status] > statusPriority[existing.status]) {
      existing.status = status;
      existing.statusReason = reason;
    }

    if (isBiloholding) {
      existing.isBiloholding = true;
      existing.badge = 'Check before approving';
    }

    if (badge && !existing.badge) {
      existing.badge = badge;
    }
  } else {
    grouped.set(emailLower, {
      email,
      clientNames: [row['Client Name']],
      segment: row['Segment'] || '',
      emailVersion: getEmailVersion(row['Segment'] || ''),
      campaign1Status: row['Campaign 1 (Sept)'] || '',
      round2Status: row['Round 2 (Nov)'] || '',
      round2Note: row['Round 2 Note'] || '',
      contacted: row['Contacted'] === 'Yes',
      rawRows: [row],
      status,
      statusReason: reason,
      badge,
      isBiloholding
    });
  }
}

// Count by status
const statusCounts = { to_review: 0, approved: 0, not_now: 0, already_contacted: 0, cant_email: 0 };
const segmentCounts = { recent: 0, lapsed: 0, dormant: 0 };
let biloholdingCount = 0;
const flaggedRows = [];

for (const contact of grouped.values()) {
  statusCounts[contact.status]++;
  segmentCounts[contact.emailVersion]++;
  if (contact.isBiloholding) {
    biloholdingCount++;
    flaggedRows.push({ email: contact.email, reason: 'Biloholding - check before approving', badge: contact.badge });
  }
  if (contact.badge && contact.badge !== 'Check before approving') {
    flaggedRows.push({ email: contact.email, reason: contact.statusReason || contact.badge, badge: contact.badge });
  }
}

console.log(`\n📧 GROUPING RESULTS`);
console.log(`-------------------`);
console.log(`Skipped (no email): ${skipped}`);
console.log(`Unique emails: ${grouped.size}`);

console.log(`\n📋 TAB BREAKDOWN`);
console.log(`----------------`);
console.log(`To review:        ${statusCounts.to_review}`);
console.log(`Approved:         ${statusCounts.approved}`);
console.log(`Not now:          ${statusCounts.not_now}`);
console.log(`Already contacted: ${statusCounts.already_contacted}`);
console.log(`Can't email:      ${statusCounts.cant_email}`);

console.log(`\n📊 SEGMENT BREAKDOWN (for To review + Approved)`);
console.log(`------------------------------------------------`);
console.log(`Recent (Last 12 Months): ${segmentCounts.recent}`);
console.log(`Lapsed (1-3 Years):      ${segmentCounts.lapsed}`);
console.log(`Dormant (3+ Years):      ${segmentCounts.dormant}`);

console.log(`\n⚠️  FLAGGED ROWS (${flaggedRows.length})`);
console.log(`-----------------`);
for (const f of flaggedRows.slice(0, 20)) {
  console.log(`  ${f.email}: ${f.badge || f.reason}`);
}
if (flaggedRows.length > 20) {
  console.log(`  ... and ${flaggedRows.length - 20} more`);
}

console.log(`\n🏷️  BILOHOLDING COUNT: ${biloholdingCount}`);

// Summary
console.log(`\n✅ SUMMARY`);
console.log(`----------`);
console.log(`Ready to import ${grouped.size} contacts.`);
console.log(`${skipped} rows skipped (no email).`);
console.log(`${statusCounts.already_contacted} already contacted (will not be emailed).`);
console.log(`${statusCounts.cant_email} can't email (bounces, holds).`);
console.log(`${statusCounts.to_review} to review.`);
console.log(`${biloholdingCount} flagged as biloholding.`);
