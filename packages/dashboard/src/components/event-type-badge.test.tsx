import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TypeBadge } from "./event-type-badge.js";

describe("TypeBadge", () => {
  it("drops the process_ prefix from the label", () => {
    render(<TypeBadge type="process_kprobe" />);
    expect(screen.getByText("kprobe")).toBeTruthy();
  });

  it("renders an unknown type verbatim", () => {
    render(<TypeBadge type="weird" />);
    expect(screen.getByText("weird")).toBeTruthy();
  });
});
