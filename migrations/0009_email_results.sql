-- Email campaign results (aggregated from Jobber exports)
CREATE TABLE IF NOT EXISTS email_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  sent INTEGER DEFAULT 0,
  delivered INTEGER DEFAULT 0,
  opened INTEGER DEFAULT 0,
  clicked INTEGER DEFAULT 0,
  bounced INTEGER DEFAULT 0,
  link_scanner_clicks INTEGER DEFAULT 0,
  booked_jobs INTEGER DEFAULT 0,
  imported_at TEXT DEFAULT (datetime('now')),
  imported_by TEXT,
  UNIQUE(campaign_id)
);

-- Update campaign names and statuses
UPDATE campaigns SET
  name = 'Round 1 (Sent · Sept)',
  status = 'completed',
  description = 'First email campaign, sent September 2026'
WHERE id = 1;

-- Note: status stays as 'paused' since CHECK constraint only allows draft/active/paused/completed
-- The UI will show "Approved, ready to launch" based on the name
UPDATE campaigns SET
  name = 'Round 2 (Approved · not yet sent)',
  status = 'paused',
  description = 'Second email campaign, 26 approved contacts ready to launch'
WHERE id = 2;

UPDATE campaigns SET
  name = 'Round 3 (Jonathan picking)',
  status = 'active',
  description = 'Third email campaign - Jonathan selecting contacts'
WHERE id = 3;

-- Insert Round 1 results from imported data
-- sent: 66, delivered: 66-9=57, opened: 7+1=8, clicked: 1, bounced: 9, link_scanner: 9
INSERT INTO email_results (campaign_id, sent, delivered, opened, clicked, bounced, link_scanner_clicks, booked_jobs)
VALUES (1, 66, 57, 8, 1, 9, 9, 0);
