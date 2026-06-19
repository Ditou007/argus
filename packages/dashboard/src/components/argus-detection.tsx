import type { DemoView, FormattedEvent, RiskBand } from "@argus/render";

/**
 * The live Argus view — presentational only; the page owns the data + polling.
 */

const BAND_COLOR: Readonly<Record<RiskBand, string>> = {
  HIGH: "#ff4d4f",
  MEDIUM: "#faad14",
  LOW: "#8c8c8c",
};

function VerdictBanner({ summary, high }: { summary: string; high: boolean }) {
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 8,
        marginBottom: 14,
        background: high ? "rgba(255,77,79,0.12)" : "rgba(82,196,26,0.10)",
        border: `1px solid ${high ? "#ff4d4f" : "#52c41a"}`,
        color: high ? "#ff7875" : "#95de64",
        fontWeight: 600,
      }}
    >
      {summary}
    </div>
  );
}

function EventRow({ event }: { event: FormattedEvent }) {
  return (
    <div
      style={{
        borderLeft: `3px solid ${BAND_COLOR[event.band]}`,
        padding: "6px 10px",
        background: event.band === "HIGH" ? "rgba(255,77,79,0.08)" : "rgba(255,255,255,0.03)",
        borderRadius: 4,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
        <span style={{ color: BAND_COLOR[event.band], fontWeight: 700, fontSize: 11 }}>{event.band}</span>
        <span style={{ fontSize: 13 }}>{event.action}</span>
      </div>
      <div style={{ color: "#8c8c8c", fontSize: 12, marginTop: 2 }}>{event.reason}</div>
    </div>
  );
}

function DetectionBody({ view }: { view: DemoView }) {
  return (
    <>
      <VerdictBanner summary={view.summary} high={view.highRiskCount > 0} />
      <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        {view.events.length === 0 ? (
          <p style={{ color: "#8c8c8c" }}>No unexplained behaviour.</p>
        ) : (
          view.events.map((e) => <EventRow key={e.id} event={e} />)
        )}
      </div>
    </>
  );
}

interface ArgusDetectionProps {
  view: DemoView | null;
  connected: boolean;
}

/**
 * Render the live Argus detection panel: a verdict banner plus the risk-ranked
 * unexplained feed (HIGH highlighted), or a waiting state before a session exists.
 * @function ArgusDetection
 * @param props - The current {@link DemoView} (or null) and live-stream status.
 */
export function ArgusDetection({ view, connected }: ArgusDetectionProps) {
  return (
    <section aria-label="Argus live detection" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: 0.5 }}>ARGUS · LIVE DETECTION</span>
        <span
          title={connected ? "live stream connected" : "reconnecting…"}
          style={{ width: 8, height: 8, borderRadius: "50%", background: connected ? "#52c41a" : "#8c8c8c" }}
        />
      </header>
      {view ? <DetectionBody view={view} /> : <p style={{ color: "#8c8c8c" }}>Waiting for the agent session…</p>}
    </section>
  );
}
