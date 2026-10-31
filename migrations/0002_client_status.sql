-- Add client_status column to clients table
-- Values: 'existing_client' | 'prospect'
-- Default to 'prospect' for new imports

ALTER TABLE clients ADD COLUMN client_status TEXT DEFAULT 'prospect' CHECK (client_status IN ('existing_client', 'prospect'));

-- Create index for filtering by status
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(client_status);
