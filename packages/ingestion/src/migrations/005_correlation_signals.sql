-- Multi-signal correlation: store per-signal score breakdowns
-- and add indexes for efficient raw_event querying

-- Store signal breakdown per correlation
ALTER TABLE event_correlations ADD COLUMN IF NOT EXISTS signal_scores JSONB DEFAULT '{}';

-- Clean up any duplicate correlations before adding constraint
DELETE FROM event_correlations a USING event_correlations b
WHERE a.id < b.id AND a.action_id = b.action_id AND a.event_id = b.event_id;

-- Prevent duplicate correlations (needed for ON CONFLICT upsert)
DO $$ BEGIN
  ALTER TABLE event_correlations
    ADD CONSTRAINT uq_correlation_action_event UNIQUE (action_id, event_id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- GIN index for JSONB path queries on raw_event
CREATE INDEX IF NOT EXISTS idx_events_raw_event_gin ON events USING gin (raw_event jsonb_path_ops);

-- Index for event_time range queries
CREATE INDEX IF NOT EXISTS idx_events_event_time ON events (event_time);
