import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { selectProvider } from "./llm.js";
import { createArgusClient } from "./argus.js";
import { runTool } from "./tools.js";
import { createApp, attachChatSocket } from "./server.js";
import type { ChatTurnDeps } from "./loop.js";

/** Boot the agent: resolve config + provider, open an Argus session, serve chat. */
export const main = async (): Promise<void> => {
  const config = loadConfig();
  const provider = selectProvider();
  if (!provider) {
    logger.error("no_llm_key", { hint: "set GROQ_API_KEY or ANTHROPIC_API_KEY" });
    process.exit(1);
  }

  const argus = createArgusClient({ apiUrl: config.argusApiUrl, agentName: config.agentName, log: logger });
  await argus.start();

  const deps: ChatTurnDeps = {
    callLlm: provider.call,
    declare: argus.declare,
    runTool,
    log: logger,
    llmActionName: provider.name,
  };

  const app = createApp({ deps, log: logger });
  const server = app.listen(config.port, () => {
    logger.info("agent_listening", { port: config.port, provider: provider.name });
  });
  attachChatSocket(server, { deps, log: logger });

  const shutdown = async (): Promise<void> => {
    await argus.end();
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

// Only auto-run when executed directly (node dist/index.js), not when imported
// by a test — so the bootstrap is unit-testable without starting a server.
const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  main().catch((err) => {
    logger.error("agent_fatal", { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
}
