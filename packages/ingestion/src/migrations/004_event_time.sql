-- Store the actual Tetragon event time (when the syscall happened)
-- distinct from created_at (when it was inserted into the DB)
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_time TIMESTAMPTZ;

-- Index for correlation using event_time
CREATE INDEX IF NOT EXISTS idx_events_pod_event_time ON events(pod_name, event_time);
