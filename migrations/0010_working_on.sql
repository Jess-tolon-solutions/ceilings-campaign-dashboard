-- Working On items for Overview card
-- Admin-editable list with status: in_progress, waiting, done

CREATE TABLE IF NOT EXISTS working_on (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress', 'waiting', 'done')),
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  updated_by TEXT
);

-- Seed with initial items
INSERT INTO working_on (title, status, sort_order) VALUES
  ('Monthly reporting automation', 'in_progress', 1),
  ('Social media integration', 'in_progress', 2),
  ('Q4 campaign planning', 'waiting', 3);
