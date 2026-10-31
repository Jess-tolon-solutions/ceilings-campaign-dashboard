-- Add do_not_send and hold flags to clients table
ALTER TABLE clients ADD COLUMN do_not_send INTEGER DEFAULT 0;
ALTER TABLE clients ADD COLUMN hold INTEGER DEFAULT 0;

-- Add notes column to mail_drops for special instructions
ALTER TABLE mail_drops ADD COLUMN notes TEXT;
