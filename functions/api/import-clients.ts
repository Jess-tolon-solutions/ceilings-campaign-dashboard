// POST /api/import-clients - Import clients from CSV/JSON
// Validates, dedupes on email+company, shows preview of issues, then loads to D1

interface Env {
  DB: D1Database;
}

interface Data {
  userEmail: string;
}

interface ClientRow {
  company: string;
  contact_name?: string;
  title?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  county?: string;
  segment?: string;
  locations_count?: number;
  source?: string;
}

interface ImportResult {
  success: boolean;
  preview?: boolean;
  total: number;
  valid: number;
  inserted: number;
  updated: number;
  skipped: number;
  issues: Array<{ row: number; field: string; message: string }>;
  duplicates: Array<{ row: number; company: string; email: string }>;
}

// Parse CSV string to array of objects
function parseCSV(csvText: string): ClientRow[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  // Parse header row - handle quoted fields
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine).map(h =>
    h.toLowerCase()
      .trim()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
  );

  const rows: ClientRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0 || values.every(v => !v.trim())) continue;

    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx]?.trim() || '';
    });

    // Map common field name variations
    rows.push({
      company: row.company || row.company_name || row.business || row.business_name || '',
      contact_name: row.contact_name || row.contact || row.name || row.full_name || '',
      title: row.title || row.job_title || row.position || '',
      email: row.email || row.email_address || '',
      phone: row.phone || row.phone_number || row.telephone || '',
      address: row.address || row.street || row.street_address || '',
      city: row.city || '',
      county: row.county || '',
      segment: row.segment || row.category || row.type || '',
      locations_count: parseInt(row.locations_count || row.locations || '1') || 1,
      source: row.source || 'import'
    });
  }

  return rows;
}

// Parse a single CSV line, handling quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}

// Validate a client row
function validateRow(row: ClientRow, rowNum: number): Array<{ row: number; field: string; message: string }> {
  const issues: Array<{ row: number; field: string; message: string }> = [];

  if (!row.company || row.company.trim() === '') {
    issues.push({ row: rowNum, field: 'company', message: 'Company name is required' });
  }

  if (row.email && !isValidEmail(row.email)) {
    issues.push({ row: rowNum, field: 'email', message: `Invalid email format: ${row.email}` });
  }

  if (row.phone && row.phone.replace(/\D/g, '').length < 10) {
    issues.push({ row: rowNum, field: 'phone', message: `Phone number too short: ${row.phone}` });
  }

  return issues;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const onRequestPost: PagesFunction<Env, string, Data> = async (context) => {
  const { env, request, data } = context;
  const url = new URL(request.url);
  const previewOnly = url.searchParams.get('preview') === 'true';

  try {
    const contentType = request.headers.get('content-type') || '';
    let rows: ClientRow[];

    if (contentType.includes('application/json')) {
      const body = await request.json();
      rows = Array.isArray(body) ? body : body.rows || [];
    } else if (contentType.includes('text/csv') || contentType.includes('text/plain')) {
      const csvText = await request.text();
      rows = parseCSV(csvText);
    } else {
      // Try to parse as JSON first, fall back to CSV
      const text = await request.text();
      try {
        const body = JSON.parse(text);
        rows = Array.isArray(body) ? body : body.rows || [];
      } catch {
        rows = parseCSV(text);
      }
    }

    if (rows.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No data found in import file'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate all rows
    const allIssues: Array<{ row: number; field: string; message: string }> = [];
    const duplicates: Array<{ row: number; company: string; email: string }> = [];
    const seen = new Map<string, number>();

    rows.forEach((row, idx) => {
      const rowNum = idx + 2; // +2 for 1-indexed and header row

      // Check for validation issues
      const rowIssues = validateRow(row, rowNum);
      allIssues.push(...rowIssues);

      // Check for duplicates within the import file
      const key = `${row.email?.toLowerCase() || ''}_${row.company?.toLowerCase() || ''}`;
      if (seen.has(key)) {
        duplicates.push({
          row: rowNum,
          company: row.company,
          email: row.email || '(no email)'
        });
      } else {
        seen.set(key, rowNum);
      }
    });

    // Filter to valid rows only
    const validRows = rows.filter((row, idx) => {
      const rowNum = idx + 2;
      return !allIssues.some(issue => issue.row === rowNum && issue.field === 'company');
    });

    const result: ImportResult = {
      success: true,
      preview: previewOnly,
      total: rows.length,
      valid: validRows.length,
      inserted: 0,
      updated: 0,
      skipped: rows.length - validRows.length,
      issues: allIssues.slice(0, 50), // Limit to first 50 issues
      duplicates: duplicates.slice(0, 20) // Limit to first 20 duplicates
    };

    // If preview only, return without inserting
    if (previewOnly) {
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Insert/update valid rows
    for (const row of validRows) {
      // Check if client already exists
      const existing = await env.DB.prepare(
        `SELECT id FROM clients WHERE email = ? AND company = ?`
      ).bind(row.email || '', row.company).first();

      if (existing) {
        // Update existing
        await env.DB.prepare(`
          UPDATE clients SET
            contact_name = COALESCE(?, contact_name),
            title = COALESCE(?, title),
            phone = COALESCE(?, phone),
            address = COALESCE(?, address),
            city = COALESCE(?, city),
            county = COALESCE(?, county),
            segment = COALESCE(?, segment),
            locations_count = COALESCE(?, locations_count),
            updated_at = datetime('now')
          WHERE id = ?
        `).bind(
          row.contact_name || null,
          row.title || null,
          row.phone || null,
          row.address || null,
          row.city || null,
          row.county || null,
          row.segment || null,
          row.locations_count || null,
          existing.id
        ).run();
        result.updated++;
      } else {
        // Insert new
        await env.DB.prepare(`
          INSERT INTO clients (company, contact_name, title, email, phone, address, city, county, segment, locations_count, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          row.company,
          row.contact_name || null,
          row.title || null,
          row.email || null,
          row.phone || null,
          row.address || null,
          row.city || null,
          row.county || null,
          row.segment || null,
          row.locations_count || 1,
          row.source || 'import'
        ).run();
        result.inserted++;
      }
    }

    // Log the import
    await env.DB.prepare(`
      INSERT INTO audit_log (actor, action, entity, payload)
      VALUES (?, ?, ?, ?)
    `).bind(
      data.userEmail,
      'import',
      'clients',
      JSON.stringify({
        total: result.total,
        inserted: result.inserted,
        updated: result.updated,
        skipped: result.skipped
      })
    ).run();

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Import failed:', error);
    return new Response(JSON.stringify({
      success: false,
      error: `Import failed: ${error}`
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
