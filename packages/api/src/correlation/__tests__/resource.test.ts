import { describe, it, expect } from "vitest";
import { extractFilePath, extractSockArg, extractResource } from "../resource.js";

describe("resource extraction", () => {
  it("extracts a file path from gRPC fileArg and JSON file_arg", () => {
    expect(extractFilePath({ process_kprobe: { args: [{ fileArg: { path: "/etc/passwd" } }] } })).toBe("/etc/passwd");
    expect(extractFilePath({ processKprobe: { args: [{ file_arg: { path: "/tmp/x" } }] } })).toBe("/tmp/x");
  });

  it("extracts a destination socket (daddr/dport)", () => {
    const sock = extractSockArg({ process_kprobe: { args: [{ sock_arg: { daddr: "1.2.3.4", dport: 443 } }] } });
    expect(sock).toEqual({ daddr: "1.2.3.4", dport: 443 });
  });

  it("returns null when there is no matching arg", () => {
    expect(extractFilePath({ process_exec: { process: {} } })).toBeNull();
    expect(extractSockArg({ process_kprobe: { args: [] } })).toBeNull();
  });

  it("classifies the resource a syscall touched", () => {
    expect(extractResource({ process_kprobe: { args: [{ file_arg: { path: "/a" } }] } })).toEqual({
      kind: "file",
      path: "/a",
    });
    expect(extractResource({ process_kprobe: { args: [{ sock_arg: { daddr: "9.9.9.9", dport: 53 } }] } })).toEqual({
      kind: "network",
      daddr: "9.9.9.9",
      dport: 53,
    });
    expect(extractResource({ process_exec: { process: {} } })).toEqual({ kind: "other" });
  });
});
