"use client";

import { useCallback, useEffect, useState } from "react";
import { formatTriage, type DemoView } from "@argus/render";
import { useLiveStream } from "@/hooks/use-live-stream";
import { sendChat, latestSessionId, fetchTriage } from "@/lib/agent-client";
import { ChatPanel, type ChatMessage } from "@/components/chat-panel";
import { ArgusDetection } from "@/components/argus-detection";

const POLL_MS = 2000;
const panelStyle: React.CSSProperties = {
  background: "#0f0f0f",
  border: "1px solid #1f1f1f",
  borderRadius: 12,
  padding: 16,
  minHeight: 0,
  overflow: "hidden",
};

/**
 * The live demo: chat with the weakly-guarded agent on top, watch Argus catch
 * its undeclared behaviour below. The two halves share `@argus/render`, so the
 * UI and the `pnpm demo` CLI always show the same verdict.
 */
export default function DemoPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [view, setView] = useState<DemoView | null>(null);

  // Resolve the running agent's session (retry until it's up). Once pinned we
  // stop polling; if the agent restarts mid-demo, reload to pick up its new
  // session (acceptable for a single-session demo).
  useEffect(() => {
    if (sessionId) return;
    let active = true;
    const resolve = () => {
      latestSessionId().then((id) => {
        if (active && id) setSessionId(id);
      });
    };
    resolve();
    const timer = setInterval(resolve, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [sessionId]);

  const refreshTriage = useCallback(async () => {
    if (!sessionId) return;
    const report = await fetchTriage(sessionId);
    if (report) setView(formatTriage(report));
  }, [sessionId]);

  // Poll the triage so detections surface live below the chat.
  useEffect(() => {
    void refreshTriage();
    const timer = setInterval(() => void refreshTriage(), POLL_MS);
    return () => clearInterval(timer);
  }, [refreshTriage]);

  const { connected } = useLiveStream({
    onEvent: () => void refreshTriage(),
    onAction: () => void refreshTriage(),
  });

  const onSend = useCallback(
    async (text: string) => {
      setMessages((m) => [...m, { role: "user", text }]);
      setPending(true);
      try {
        const res = await sendChat(text);
        setMessages((m) => [...m, { role: "agent", text: res.reply, runs: res.runs }]);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setMessages((m) => [...m, { role: "agent", text: `⚠ agent error: ${detail}` }]);
      } finally {
        setPending(false);
        void refreshTriage();
      }
    },
    [refreshTriage]
  );

  return (
    <main
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 16,
        padding: 16,
        height: "calc(100vh - 60px)",
        boxSizing: "border-box",
        maxWidth: 1500,
        margin: "0 auto",
      }}
    >
      <div style={panelStyle}>
        <ChatPanel messages={messages} pending={pending} onSend={onSend} />
      </div>
      <div style={panelStyle}>
        <ArgusDetection view={view} connected={connected} />
      </div>
    </main>
  );
}
