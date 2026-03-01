export default function Home() {
  return (
    <main style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "2rem", fontWeight: 700 }}>
        Argus
      </h1>
      <p style={{ color: "#a3a3a3", marginTop: "0.5rem" }}>
        AI Agent Runtime Governance & Observability
      </p>

      <div style={{
        marginTop: "2rem",
        padding: "1.5rem",
        border: "1px solid #262626",
        borderRadius: "8px",
        backgroundColor: "#141414",
      }}>
        <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>Event Stream</h2>
        <p style={{ color: "#737373" }}>
          Connect the ingestion service to see Tetragon events appear here.
        </p>
      </div>
    </main>
  );
}
