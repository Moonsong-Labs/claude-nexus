-- Migration to fix streaming_chunks table schema

-- Rename chunk_data to data if it exists
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name='streaming_chunks' 
    AND column_name='chunk_data'
  ) THEN
    ALTER TABLE streaming_chunks RENAME COLUMN chunk_data TO data;
  END IF;
END $$;

-- Change data type from JSONB to TEXT if needed
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name='streaming_chunks' 
    AND column_name='data'
    AND data_type='jsonb'
  ) THEN
    ALTER TABLE streaming_chunks ALTER COLUMN data TYPE TEXT USING data::TEXT;
  END IF;
END $$;

-- Add token_count column if it doesn't exist
ALTER TABLE streaming_chunks
  ADD COLUMN IF NOT EXISTS token_count INTEGER DEFAULT 0;

-- Add unique constraint if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'streaming_chunks_request_id_chunk_index_key'
  ) THEN
    ALTER TABLE streaming_chunks
    ADD CONSTRAINT streaming_chunks_request_id_chunk_index_key UNIQUE (request_id, chunk_index);
  END IF;
END $$;

-- Update index to include chunk_index
DROP INDEX IF EXISTS idx_streaming_chunks_request_id;
CREATE INDEX IF NOT EXISTS idx_streaming_chunks_request_id ON streaming_chunks(request_id, chunk_index);