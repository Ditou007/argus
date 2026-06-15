import { describe, it, expect } from "vitest";
import { normalizeSyscall } from "./syscall.js";

describe("normalizeSyscall", () => {
  it("strips the architecture prefix across kernels (the core SPEC_01 D11 fix)", () => {
    expect(normalizeSyscall("__arm64_sys_write")).toBe("sys_write");
    expect(normalizeSyscall("__x64_sys_write")).toBe("sys_write");
    expect(normalizeSyscall("__ia32_sys_write")).toBe("sys_write"); // 32-bit compat on x86
  });

  it("handles compat and internal syscall wrappers", () => {
    expect(normalizeSyscall("__arm64_compat_sys_write")).toBe("sys_write");
    expect(normalizeSyscall("__se_sys_write")).toBe("sys_write");
    expect(normalizeSyscall("__do_sys_read")).toBe("sys_read");
  });

  it("passes already-bare syscalls through unchanged", () => {
    expect(normalizeSyscall("sys_write")).toBe("sys_write");
    expect(normalizeSyscall("sys_read")).toBe("sys_read");
  });

  it("leaves non-syscall kprobe symbols untouched", () => {
    expect(normalizeSyscall("fd_install")).toBe("fd_install");
    expect(normalizeSyscall("tcp_connect")).toBe("tcp_connect");
    expect(normalizeSyscall("tcp_sendmsg")).toBe("tcp_sendmsg");
  });

  it("does not false-match a non-syscall name that merely contains the letters", () => {
    // boundary: 'subsys_write' is not a syscall wrapper and must pass through
    expect(normalizeSyscall("subsys_write")).toBe("subsys_write");
  });

  it("returns empty string for null/undefined", () => {
    expect(normalizeSyscall(null)).toBe("");
    expect(normalizeSyscall(undefined)).toBe("");
  });
});
