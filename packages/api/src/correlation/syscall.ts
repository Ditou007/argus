// Tetragon reports syscall kprobes with the kernel's SYSCALL_DEFINE wrapper
// naming, which carries an architecture (and sometimes compat) prefix:
//   arm64   → __arm64_sys_write
//   x86-64  → __x64_sys_write
//   ia32    → __ia32_sys_write
//   compat  → __arm64_compat_sys_write
//   internal→ __se_sys_write / __do_sys_write
// …while the engine's expected-function lists use the bare `sys_write`. Rather
// than enumerate prefixes (brittle across kernels/arches), we extract the
// canonical `sys_<name>` core wherever it appears, so correlation is
// architecture-independent by construction (SPEC_01 D11). Non-syscall symbols
// (`fd_install`, `tcp_connect`) and already-bare names pass through unchanged.
const SYSCALL_CORE = /(?:^|_)(sys_[a-z0-9_]+)$/;

/**
 * Normalize a kernel function name to its architecture-independent syscall core,
 * e.g. `__arm64_sys_write` / `__x64_sys_write` / `__arm64_compat_sys_write` →
 * `sys_write`. Symbols without a `sys_` core return unchanged.
 * @function normalizeSyscall
 * @param fn - The raw function name from the event (may be null/undefined).
 * @returns The normalized name; empty string when fn is null/undefined.
 */
export const normalizeSyscall = (fn: string | null | undefined): string => {
  const raw = fn ?? "";
  const match = raw.match(SYSCALL_CORE);
  return match ? match[1] : raw;
};
