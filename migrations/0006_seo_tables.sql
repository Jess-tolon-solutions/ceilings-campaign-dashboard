-- Add metrics summary table for plain-English bullets
CREATE TABLE IF NOT EXISTS metrics_summary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('gsc', 'ga4', 'meta')),
  bullets TEXT NOT NULL,  -- JSON array of 3 summary strings
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(month, source)
);

CREATE INDEX IF NOT EXISTS idx_metrics_summary_month ON metrics_summary(month);

-- SEO keywords table (from GSC)
CREATE TABLE IF NOT EXISTS seo_keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,
  keyword TEXT NOT NULL,
  target_page TEXT,
  position REAL,
  clicks INTEGER,
  impressions INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(month, keyword)
);

CREATE INDEX IF NOT EXISTS idx_seo_keywords_month ON seo_keywords(month);
CREATE INDEX IF NOT EXISTS idx_seo_keywords_position ON seo_keywords(position);

-- SEO pages table (from GSC)
CREATE TABLE IF NOT EXISTS seo_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,
  url TEXT NOT NULL,
  clicks INTEGER,
  top_query TEXT,
  index_status TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(month, url)
);

CREATE INDEX IF NOT EXISTS idx_seo_pages_month ON seo_pages(month);
