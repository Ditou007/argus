"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { StatusBadge } from "./status-badge";

const navLinks = [
  { href: "/", label: "Events" },
  { href: "/sessions", label: "Sessions" },
];

export const Nav = () => {
  const pathname = usePathname();

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.75rem 2rem",
        borderBottom: "1px solid #262626",
        backgroundColor: "#0a0a0a",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
        <Link href="/" style={{ textDecoration: "none", color: "#e5e5e5" }}>
          <span style={{ fontSize: "1.125rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
            Argus
          </span>
        </Link>

        <nav style={{ display: "flex", gap: "0.25rem" }}>
          {navLinks.map(({ href, label }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                style={{
                  padding: "0.375rem 0.75rem",
                  borderRadius: "6px",
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  textDecoration: "none",
                  color: active ? "#e5e5e5" : "#737373",
                  backgroundColor: active ? "#262626" : "transparent",
                  transition: "all 0.15s",
                }}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      <StatusBadge />
    </header>
  );
};
