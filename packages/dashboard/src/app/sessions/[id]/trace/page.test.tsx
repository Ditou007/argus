import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "s1" }) }));
vi.mock("@/lib/api", () => ({
  fetchSessionTrace: vi.fn(async () => ({ session_id: "s1", count: 0, events: [] })),
}));

import { render, screen } from "@testing-library/react";
import SessionTracePage from "./page.js";

describe("SessionTracePage", () => {
  it("renders the forensic-trace heading and the empty state before data loads", () => {
    render(<SessionTracePage />);
    expect(screen.getByText(/forensic trace/i)).toBeTruthy();
    expect(screen.getByText(/no correlated trace/i)).toBeTruthy();
  });
});
