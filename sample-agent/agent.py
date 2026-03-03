"""
Sample AI Agent - Simulates typical agent behavior for Tetragon to observe.

This script mimics what a real AI agent does at the OS level:
1. Reads files (file I/O syscalls)
2. Makes HTTP requests (network syscalls)
3. Writes output files (file write syscalls)
4. Spawns subprocesses (exec syscalls)

Tetragon will capture all of these as kernel events.
"""

import os
import time
import json
import subprocess
import urllib.request

WORK_DIR = "/tmp/agent-workspace"

def setup():
    """Create a workspace directory."""
    os.makedirs(WORK_DIR, exist_ok=True)
    print(f"[agent] Workspace created: {WORK_DIR}")

def read_system_info():
    """Read system files — triggers file read syscalls."""
    files_to_read = ["/etc/hostname", "/etc/os-release"]
    info = {}
    for path in files_to_read:
        try:
            with open(path, "r") as f:
                info[path] = f.read().strip()
                print(f"[agent] Read {path}")
        except FileNotFoundError:
            print(f"[agent] Skipped {path} (not found)")
    return info

def make_network_request():
    """Make an HTTP request — triggers network syscalls."""
    url = "https://httpbin.org/json"
    print(f"[agent] Making HTTP request to {url}")
    try:
        req = urllib.request.urlopen(url, timeout=10)
        data = json.loads(req.read().decode())
        print(f"[agent] Got response: {list(data.keys())}")
        return data
    except Exception as e:
        print(f"[agent] Request failed: {e}")
        return None

def write_output(data):
    """Write results to a file — triggers file write syscalls."""
    output_path = os.path.join(WORK_DIR, "agent-output.json")
    with open(output_path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"[agent] Wrote output to {output_path}")

def run_subprocess():
    """Spawn a subprocess — triggers exec syscalls."""
    print("[agent] Running subprocess: ls -la /tmp")
    result = subprocess.run(["ls", "-la", "/tmp"], capture_output=True, text=True)
    print(f"[agent] Subprocess output: {result.stdout[:200]}")

def simulate_agent_loop():
    """Main agent loop — runs multiple cycles to generate events."""
    print("=" * 50)
    print("[agent] AI Agent Simulation Starting")
    print("=" * 50)

    setup()

    for cycle in range(3):
        print(f"\n--- Cycle {cycle + 1} ---")

        # Step 1: Read environment
        info = read_system_info()

        # Step 2: "Think" (simulate LLM call with network request)
        response = make_network_request()

        # Step 3: Take action (write file + run command)
        write_output({"cycle": cycle, "system_info": info, "llm_response": response})
        run_subprocess()

        # Step 4: Wait before next cycle
        print(f"[agent] Cycle {cycle + 1} complete, waiting...")
        time.sleep(2)

    print("\n" + "=" * 50)
    print("[agent] Agent simulation complete")
    print("=" * 50)

if __name__ == "__main__":
    simulate_agent_loop()
