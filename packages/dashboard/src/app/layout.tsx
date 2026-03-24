import type { Metadata } from "next";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "Argus — Agent Observability",
  description: "AI Agent Runtime Governance & Observability Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: "#0a0a0a",
          color: "#e5e5e5",
        }}
      >
        <Nav />
        {children}
      </body>
    </html>
  );
}
