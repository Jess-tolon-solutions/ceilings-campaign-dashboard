-- Client Re-engagement contacts (grouped by email)
CREATE TABLE IF NOT EXISTS reengagement_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  client_names TEXT,           -- JSON array of all client names for this email
  phone TEXT,
  job_type TEXT,
  last_invoice_date TEXT,
  segment TEXT,                -- 'Last 12 Months', '1-3 Years', '3+ Years', 'Not in QBO list'
  email_version TEXT,          -- 'recent', 'lapsed', 'dormant' (derived from segment)

  -- Status for 5-tab structure
  status TEXT NOT NULL DEFAULT 'to_review' CHECK (status IN ('to_review', 'approved', 'not_now', 'already_contacted', 'cant_email')),
  status_reason TEXT,          -- e.g. 'Campaign 1 bounce', 'Held - billing inbox'
  badge TEXT,                  -- UI badge: 'Warm-tier email', 'Your call', 'Check before approving', 'Sent Nov 5'

  -- Campaign 1 results
  campaign1_status TEXT,       -- e.g. 'Sent - Bounced', 'Sent - Opened and clicked'
  campaign1_sent INTEGER DEFAULT 0,

  -- Round 2 status from CSV
  round2_status TEXT,
  round2_note TEXT,

  -- Carried over from old clients table
  old_decision TEXT,           -- yes/no/later from Jonathan's previous picks
  do_not_send INTEGER DEFAULT 0,
  hold INTEGER DEFAULT 0,

  -- Admin-editable fields
  contacted INTEGER DEFAULT 0,
  admin_note TEXT,

  -- Metadata
  source TEXT,
  rows_sharing_email INTEGER DEFAULT 1,
  raw_rows TEXT,               -- JSON array of all original rows for this email

  -- Flags
  is_biloholding INTEGER DEFAULT 0,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reengagement_status ON reengagement_contacts(status);
CREATE INDEX IF NOT EXISTS idx_reengagement_segment ON reengagement_contacts(segment);
CREATE INDEX IF NOT EXISTS idx_reengagement_email_version ON reengagement_contacts(email_version);

-- Campaign results for reengagement (admin-editable)
CREATE TABLE IF NOT EXISTS reengagement_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_name TEXT NOT NULL UNIQUE,  -- 'Round 1', 'Round 2', etc.
  sent_date TEXT,

  -- Main stats
  sent INTEGER DEFAULT 0,
  bounced INTEGER DEFAULT 0,
  delivered INTEGER DEFAULT 0,
  opened INTEGER DEFAULT 0,
  clicked INTEGER DEFAULT 0,           -- Human clicks only
  link_scanner_clicks INTEGER DEFAULT 0,

  -- Bounce list (comma-separated company names)
  bounce_list TEXT,

  -- Admin-editable fields
  replies INTEGER DEFAULT 0,
  calls_mentioning_cru25 INTEGER DEFAULT 0,
  booked_jobs INTEGER DEFAULT 0,
  revenue REAL DEFAULT 0,

  -- Notes
  notes TEXT,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Insert Round 1 results
INSERT OR REPLACE INTO reengagement_results (
  campaign_name, sent_date, sent, bounced, delivered, opened, clicked, link_scanner_clicks, bounce_list
) VALUES (
  'Round 1', '2026-09-01',
  33, 6, 27, 8, 1, 9,
  'Red Lobster/Darden, Brio, Broward Health, Lincoln Tech, Better Spaces, Starboard'
);

-- Insert Round 2 results (sent Nov 5 to 12 contacts, admin will fill in Jobber numbers)
INSERT OR REPLACE INTO reengagement_results (
  campaign_name, sent_date, sent
) VALUES (
  'Round 2', '2026-11-05',
  12
);

-- Archive table for old clients (keeps original data)
CREATE TABLE IF NOT EXISTS clients_archive AS SELECT * FROM clients WHERE 0;
CREATE TABLE IF NOT EXISTS campaign_selections_archive AS SELECT * FROM campaign_selections WHERE 0;
