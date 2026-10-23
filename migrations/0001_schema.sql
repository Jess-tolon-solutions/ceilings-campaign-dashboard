-- Ceilings R Us Campaign Dashboard - D1 Schema
-- All data including Jonathan's selections

-- Client list (source of truth after initial import)
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company TEXT NOT NULL,
  contact_name TEXT,
  title TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  county TEXT,
  segment TEXT,
  locations_count INTEGER DEFAULT 1,
  source TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_email_company ON clients(email, company);
CREATE INDEX IF NOT EXISTS idx_clients_county ON clients(county);
CREATE INDEX IF NOT EXISTS idx_clients_segment ON clients(segment);

-- Campaigns (email, linkedin, direct_mail, phone)
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'linkedin', 'direct_mail', 'phone')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  round INTEGER DEFAULT 1,
  launch_date TEXT,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Jonathan's selections for each campaign round
CREATE TABLE IF NOT EXISTS campaign_selections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  client_id INTEGER NOT NULL REFERENCES clients(id),
  decision TEXT CHECK (decision IN ('yes', 'no', 'later')),
  note TEXT,
  decided_by TEXT,
  decided_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(campaign_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_selections_campaign ON campaign_selections(campaign_id);
CREATE INDEX IF NOT EXISTS idx_selections_decision ON campaign_selections(decision);

-- Direct mail drops for A/B test
CREATE TABLE IF NOT EXISTS mail_drops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  arm TEXT NOT NULL CHECK (arm IN ('A_violation_business', 'B_new_address_per_location')),
  list_source TEXT,
  business_name TEXT,
  address TEXT,
  county TEXT,
  violation_date TEXT,
  violation_type TEXT,
  tracking_code TEXT,
  mailed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mail_drops_campaign ON mail_drops(campaign_id);
CREATE INDEX IF NOT EXISTS idx_mail_drops_arm ON mail_drops(arm);
CREATE INDEX IF NOT EXISTS idx_mail_drops_tracking ON mail_drops(tracking_code);

-- Responses from all channels
CREATE TABLE IF NOT EXISTS responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  mail_drop_id INTEGER REFERENCES mail_drops(id),
  client_id INTEGER REFERENCES clients(id),
  channel TEXT NOT NULL,
  response_type TEXT NOT NULL CHECK (response_type IN ('call', 'form', 'qr_scan', 'email_reply', 'booked_job')),
  tracking_code TEXT,
  received_at TEXT DEFAULT (datetime('now')),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_responses_campaign ON responses(campaign_id);
CREATE INDEX IF NOT EXISTS idx_responses_type ON responses(response_type);

-- Monthly metrics from GSC, GA4, Meta
CREATE TABLE IF NOT EXISTS metrics_monthly (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('gsc', 'ga4', 'meta')),
  metric TEXT NOT NULL,
  dimension TEXT,
  value REAL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(month, source, metric, dimension)
);

CREATE INDEX IF NOT EXISTS idx_metrics_month ON metrics_monthly(month);
CREATE INDEX IF NOT EXISTS idx_metrics_source ON metrics_monthly(source);

-- Audit log for all writes
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  payload TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity);
