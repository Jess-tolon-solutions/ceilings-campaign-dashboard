-- Expand response_type to include email tracking types
-- SQLite doesn't support ALTER CHECK, so we recreate the table

-- Create new table with expanded check constraint (matching original schema)
CREATE TABLE responses_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  mail_drop_id INTEGER REFERENCES mail_drops(id),
  client_id INTEGER REFERENCES clients(id),
  channel TEXT NOT NULL,
  response_type TEXT NOT NULL CHECK (response_type IN ('call', 'form', 'qr_scan', 'email_reply', 'booked_job', 'email_open', 'email_click', 'link_scanner', 'no_engagement', 'bounced')),
  tracking_code TEXT,
  received_at TEXT DEFAULT (datetime('now')),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Copy existing data
INSERT INTO responses_new SELECT * FROM responses;

-- Drop old table
DROP TABLE responses;

-- Rename new table
ALTER TABLE responses_new RENAME TO responses;
