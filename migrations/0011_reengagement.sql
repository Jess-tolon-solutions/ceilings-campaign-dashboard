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

  -- Campaign 1 results
  campaign1_status TEXT,       -- e.g. 'Sent - Bounced', 'Sent - Opened and clicked'
  campaign1_sent INTEGER DEFAULT 0,

  -- Round 2 status from CSV
  round2_status TEXT,
  round2_note TEXT,

  -- Admin-editable fields
  contacted INTEGER DEFAULT 0,
  admin_note TEXT,

  -- Metadata
  source TEXT,
  rows_sharing_email INTEGER DEFAULT 1,
  raw_rows TEXT,               -- JSON array of all original rows for this email

  -- Flags
  is_biloholding INTEGER DEFAULT 0,
  do_not_send INTEGER DEFAULT 0,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reengagement_status ON reengagement_contacts(status);
CREATE INDEX IF NOT EXISTS idx_reengagement_segment ON reengagement_contacts(segment);
CREATE INDEX IF NOT EXISTS idx_reengagement_email_version ON reengagement_contacts(email_version);

-- Campaign results for reengagement
CREATE TABLE IF NOT EXISTS reengagement_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_name TEXT NOT NULL,      -- 'Campaign 1', 'Campaign 2', etc.
  sent_date TEXT,

  -- By segment
  recent_sent INTEGER DEFAULT 0,
  recent_delivered INTEGER DEFAULT 0,
  recent_opened INTEGER DEFAULT 0,
  recent_clicked INTEGER DEFAULT 0,
  recent_bounced INTEGER DEFAULT 0,

  lapsed_sent INTEGER DEFAULT 0,
  lapsed_delivered INTEGER DEFAULT 0,
  lapsed_opened INTEGER DEFAULT 0,
  lapsed_clicked INTEGER DEFAULT 0,
  lapsed_bounced INTEGER DEFAULT 0,

  dormant_sent INTEGER DEFAULT 0,
  dormant_delivered INTEGER DEFAULT 0,
  dormant_opened INTEGER DEFAULT 0,
  dormant_clicked INTEGER DEFAULT 0,
  dormant_bounced INTEGER DEFAULT 0,

  -- Totals
  total_sent INTEGER DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,
  total_bounced INTEGER DEFAULT 0,
  total_booked_jobs INTEGER DEFAULT 0,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  UNIQUE(campaign_name)
);
