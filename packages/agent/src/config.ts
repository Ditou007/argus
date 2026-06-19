/** Agent backend configuration, read from the environment at the boundary. */
export interface AgentConfig {
  readonly port: number;
  readonly argusApiUrl: string;
  readonly agentName: string;
  readonly workDir: string;
}

const DEFAULT_PORT = 4001;

/**
 * Read the agent configuration from the environment, with demo-friendly defaults.
 * @function loadConfig
 * @returns The resolved {@link AgentConfig}.
 */
export const loadConfig = (): AgentConfig => ({
  port: parseInt(process.env.AGENT_PORT ?? String(DEFAULT_PORT), 10),
  argusApiUrl: process.env.ARGUS_API_URL ?? "http://localhost:3001",
  agentName: process.env.AGENT_NAME ?? "demo-chatbot",
  workDir: process.env.AGENT_WORK_DIR ?? "/workspace",
});
