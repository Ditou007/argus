-- Initial schema: events table for Tetragon event storage
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  process_binary VARCHAR(512),
  process_pid INTEGER,
  function_name VARCHAR(256),
  raw_event JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_type ON events (event_type);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events (created_at);
CREATE INDEX IF NOT EXISTS idx_events_binary ON events (process_binary);
