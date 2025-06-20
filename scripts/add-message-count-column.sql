-- Migration script to add message_count column to api_requests table

-- Add the message_count column
ALTER TABLE api_requests
ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0;

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_api_requests_message_count ON api_requests(message_count);

-- Add comment
COMMENT ON COLUMN api_requests.message_count IS 'Total number of messages in the conversation up to this request';

-- Update existing records (optional - set to 0 for now, can be recalculated later)
UPDATE api_requests 
SET message_count = 0 
WHERE message_count IS NULL;