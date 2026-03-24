-- Agent correlation tables: sessions, actions, and event correlations

CREATE TABLE IF NOT EXISTS agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name VARCHAR(256) NOT NULL,
  agent_pid INTEGER NOT NULL,
  host_name VARCHAR(256),
  metadata JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  action_type VARCHAR(100) NOT NULL,
  action_name VARCHAR(256),
  input_summary TEXT,
  output_summary TEXT,
  metadata JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_correlations (
  id SERIAL PRIMARY KEY,
  action_id UUID NOT NULL REFERENCES agent_actions(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  confidence REAL DEFAULT 1.0,
  correlation_method VARCHAR(50) DEFAULT 'pid_time_window',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_sessions_pid ON agent_sessions(agent_pid);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON agent_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_actions_session ON agent_actions(session_id);
CREATE INDEX IF NOT EXISTS idx_actions_time ON agent_actions(started_at, ended_at);
CREATE INDEX IF NOT EXISTS idx_correlations_action ON event_correlations(action_id);
CREATE INDEX IF NOT EXISTS idx_correlations_event ON event_correlations(event_id);

-- Compound index for correlation queries (PID + time window)
CREATE INDEX IF NOT EXISTS idx_events_pid_time ON events(process_pid, created_at);
