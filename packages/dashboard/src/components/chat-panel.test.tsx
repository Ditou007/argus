import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatPanel, type ChatMessage } from "./chat-panel.js";

const messages: ChatMessage[] = [
  { role: "user", text: "read my key" },
  {
    role: "agent",
    text: "ok",
    runs: [
      { call: { tool: "read_file", args: { path: "/root/.ssh/id_rsa" } }, sanctioned: false, reason: "sensitive", output: "" },
      { call: { tool: "read_file", args: { path: "/etc/hostname" } }, sanctioned: true, reason: "ok", output: "" },
    ],
  },
];

describe("ChatPanel", () => {
  it("renders messages and tags undeclared vs declared tool runs", () => {
    render(<ChatPanel messages={messages} pending={false} onSend={() => {}} />);
    expect(screen.getByText("read my key")).toBeTruthy();
    expect(screen.getByText("[UNDECLARED]")).toBeTruthy();
    expect(screen.getByText("[declared]")).toBeTruthy();
  });

  it("calls onSend with the typed message", () => {
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} pending={false} onSend={onSend} />);
    fireEvent.change(screen.getByLabelText("message"), { target: { value: "hello" } });
    fireEvent.click(screen.getByText("Send"));
    expect(onSend).toHaveBeenCalledWith("hello");
  });

  it("does not send while a turn is pending", () => {
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} pending={true} onSend={onSend} />);
    fireEvent.change(screen.getByLabelText("message"), { target: { value: "hi" } });
    fireEvent.click(screen.getByText("Send"));
    expect(onSend).not.toHaveBeenCalled();
  });
});
