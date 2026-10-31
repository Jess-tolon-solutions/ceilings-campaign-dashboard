-- Add fields for CRU_Campaign_Tracker import

-- Add Flag and Notes columns to clients (from the tracker)
ALTER TABLE clients ADD COLUMN flag TEXT;
ALTER TABLE clients ADD COLUMN notes TEXT;

-- Add contacted_in_email_1 to track clients who were in Campaign 1
ALTER TABLE clients ADD COLUMN contacted_in_email_1 INTEGER DEFAULT 0;

-- Update responses table to handle "link scanner" type
-- Already has response_type, but we need to add 'link_scanner' as a valid type
-- SQLite doesn't support ALTER CHECK, so we'll handle this in code

-- Add review_flag to mail_drops for "Jonathan to decide" rows
ALTER TABLE mail_drops ADD COLUMN review_flag TEXT;
ALTER TABLE mail_drops ADD COLUMN status TEXT;
