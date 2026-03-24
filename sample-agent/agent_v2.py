"""
Enhanced AI Agent — Uses Argus SDK for full observability.

Each step is wrapped in an Argus action, enabling correlation between
high-level agent actions and the kernel-level syscalls that Tetragon captures.

Run with: python sample-agent/agent_v2.py
"""

import os
import time
import json
import subprocess
import urllib.request
from argus_sdk import ArgusSession

WORK_DIR = "/tmp/agent-workspace"
ARGUS_API = os.environ.get("ARGUS_API_URL", "http://localhost:3001")


def main():
    print("=" * 60)
    print("  Argus-Instrumented AI Agent v2")
    print("=" * 60)

    os.makedirs(WORK_DIR, exist_ok=True)

    # Start an Argus session
    session = ArgusSession("sample-agent-v2", api_url=ARGUS_API)
    session.start()

    try:
        for cycle in range(5):
            print(f"\n--- Cycle {cycle + 1}/5 ---")

            # Step 1: Read system files
            with session.action("file_read", "read_system_info", input_summary="/etc/hostname, /etc/os-release") as act:
                info = {}
                for path in ["/etc/hostname", "/etc/os-release"]:
                    try:
                        with open(path, "r") as f:
                            info[path] = f.read().strip()
                            print(f"  [read] {path}")
                    except FileNotFoundError:
                        print(f"  [skip] {path} not found")
                act.set_output(json.dumps(info)[:500])

            time.sleep(1)  # Separate time windows for clean correlation

            # Step 2: Make HTTP request (simulate LLM call)
            with session.action("network_request", "httpbin_json", input_summary="GET https://httpbin.org/json") as act:
                try:
                    print("  [net] Requesting httpbin.org/json...")
                    req = urllib.request.urlopen("https://httpbin.org/json", timeout=10)
                    data = json.loads(req.read().decode())
                    print(f"  [net] Got response: {list(data.keys())}")
                    act.set_output(json.dumps(data)[:500])
                except Exception as e:
                    print(f"  [net] Request failed: {e}")
                    act.set_output(f"error: {e}")

            time.sleep(1)

            # Step 3: Write output file
            with session.action("file_write", "write_output", input_summary=f"cycle {cycle + 1} results") as act:
                output_path = os.path.join(WORK_DIR, f"output-cycle-{cycle + 1}.json")
                output = {"cycle": cycle + 1, "system_info": info, "timestamp": time.time()}
                with open(output_path, "w") as f:
                    json.dump(output, f, indent=2)
                print(f"  [write] {output_path}")
                act.set_output(f"Wrote {output_path}")

            time.sleep(1)

            # Step 4: Run subprocess
            with session.action("tool_use", "subprocess_ls", input_summary="ls -la /tmp") as act:
                print("  [exec] Running: ls -la /tmp")
                result = subprocess.run(["ls", "-la", "/tmp"], capture_output=True, text=True)
                act.set_output(result.stdout[:500])

            time.sleep(2)  # Pause between cycles

    finally:
        session.end()

    print("\n" + "=" * 60)
    print("  Agent complete. Check Argus dashboard for correlated events.")
    print("=" * 60)


if __name__ == "__main__":
    main()
