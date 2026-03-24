-- Add Kubernetes metadata columns for pod-based correlation
ALTER TABLE events ADD COLUMN IF NOT EXISTS pod_name VARCHAR(256);
ALTER TABLE events ADD COLUMN IF NOT EXISTS pod_namespace VARCHAR(256);
ALTER TABLE events ADD COLUMN IF NOT EXISTS container_id VARCHAR(128);

-- Add pod_name to agent_sessions for K8s-based correlation
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS pod_name VARCHAR(256);

-- Indexes for pod-based correlation queries
CREATE INDEX IF NOT EXISTS idx_events_pod_time ON events(pod_name, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_pod ON agent_sessions(pod_name);
