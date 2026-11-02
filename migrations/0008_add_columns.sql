-- Add tracked column to seo_keywords (1 = target keyword, 0 = untracked query)
ALTER TABLE seo_keywords ADD COLUMN tracked INTEGER DEFAULT 1;

-- Add dbpr_license to mail_drops for postcard matching
ALTER TABLE mail_drops ADD COLUMN dbpr_license TEXT;

-- Index for postcard matching
CREATE INDEX IF NOT EXISTS idx_mail_drops_license ON mail_drops(dbpr_license);
