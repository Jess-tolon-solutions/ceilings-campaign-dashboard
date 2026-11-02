-- Call sheet for inspection data / Jonathan's outreach
CREATE TABLE IF NOT EXISTS call_sheet (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start TEXT NOT NULL,
  rank INTEGER,
  business_name TEXT NOT NULL,
  tier TEXT CHECK (tier IN ('DRIVE', 'REMOTE')),
  venue_type TEXT,
  address TEXT,
  city TEXT,
  zip TEXT,
  phone TEXT,
  ask_for TEXT,
  seats INTEGER,
  owner_mail_address TEXT,
  best_time TEXT,
  hours TEXT,
  dbpr_license TEXT NOT NULL,
  signal_score REAL,
  v36_count INTEGER DEFAULT 0,
  high_priority_count INTEGER DEFAULT 0,
  total_violations INTEGER DEFAULT 0,
  enforcement_status TEXT,
  last_inspection_date TEXT,
  open_case INTEGER DEFAULT 0,
  look_at TEXT,
  -- Dashboard-managed fields (never overwritten by ingest)
  touches INTEGER DEFAULT 0,
  last_touch_at TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'visited', 'called', 'won', 'not_interested', 'closed', 'closed_gone', 'do_not_contact')),
  outcome_note TEXT,
  outcome_by TEXT,
  -- Postcard tracking
  on_postcard_list INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(dbpr_license, week_start)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_call_sheet_week ON call_sheet(week_start);
CREATE INDEX IF NOT EXISTS idx_call_sheet_status ON call_sheet(status);
CREATE INDEX IF NOT EXISTS idx_call_sheet_license ON call_sheet(dbpr_license);
