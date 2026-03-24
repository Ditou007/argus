"""
Real AI Agent — A research assistant instrumented with Argus SDK.

This agent does real work:
1. Reads local files to understand a task
2. Calls an LLM API (OpenAI, Anthropic, or Groq) to analyze content
3. Makes web requests to fetch live data
4. Writes analysis results to files
5. Runs shell commands for system info

Each step is tracked by Argus, generating real correlated kernel events.

Setup:
  Set one of these env vars:
    ANTHROPIC_API_KEY=sk-ant-...
    GROQ_API_KEY=gsk_...
    GEMINI_API_KEY=AI...

  Run:
    python sample-agent/real_agent.py

  Or in K8s:
    kubectl apply -f k8s/real-agent-job.yaml
"""

import os
import sys
import time
import json
import subprocess
import urllib.request
import urllib.error
from argus_sdk import ArgusSession

WORK_DIR = "/tmp/argus-research"
ARGUS_API = os.environ.get("ARGUS_API_URL", "http://localhost:3001")


# --- LLM Providers ---

def call_anthropic(prompt, model="claude-haiku-4-5-20251001"):
    """Call Anthropic Messages API."""
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return None
    body = json.dumps({
        "model": model,
        "max_tokens": 500,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())
        return data["content"][0]["text"]


def call_groq(prompt, model="llama-3.1-8b-instant"):
    """Call Groq API (OpenAI-compatible)."""
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        return None
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 500,
    }).encode()
    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
            "User-Agent": "argus-agent/0.1",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())
        return data["choices"][0]["message"]["content"]


def call_gemini(prompt, model="gemini-2.0-flash"):
    """Call Google Gemini API."""
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        return None
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"maxOutputTokens": 500},
    }).encode()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())
        return data["candidates"][0]["content"]["parts"][0]["text"]


def get_llm_provider():
    """Detect which LLM provider is configured."""
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic", call_anthropic, "https://api.anthropic.com/v1/messages"
    if os.environ.get("GROQ_API_KEY"):
        return "groq", call_groq, "https://api.groq.com/openai/v1/chat/completions"
    if os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"):
        return "gemini", call_gemini, "https://generativelanguage.googleapis.com/v1beta/models"
    return None, None, None


# --- Agent Tasks ---

def task_gather_system_info(session):
    """Gather system information by reading files and running commands."""
    info = {}

    # Read system files
    with session.action("file_read", "read_system_info",
                        input_summary="/etc/hostname, /etc/os-release") as act:
        for path in ["/etc/hostname", "/etc/os-release", "/etc/resolv.conf"]:
            try:
                with open(path) as f:
                    info[path] = f.read().strip()[:200]
                    print(f"  [read] {path}")
            except (FileNotFoundError, PermissionError):
                print(f"  [skip] {path}")
        act.set_output(json.dumps(list(info.keys())))

    time.sleep(0.5)

    # Run system commands
    with session.action("tool_use", "system_commands",
                        input_summary="uname -a, df -h, ps aux") as act:
        commands = [
            ["uname", "-a"],
            ["df", "-h"],
            ["ps", "aux"],
        ]
        results = []
        for cmd in commands:
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
                results.append(f"{' '.join(cmd)}: {result.stdout[:200]}")
                print(f"  [exec] {' '.join(cmd)}")
            except (subprocess.TimeoutExpired, FileNotFoundError) as e:
                results.append(f"{' '.join(cmd)}: error - {e}")
        info["commands"] = results
        act.set_output(f"Ran {len(commands)} commands")

    return info


def task_fetch_external_data(session):
    """Fetch live data from public APIs."""
    data = {}

    with session.action("network_request", "github_api",
                        input_summary="GET https://api.github.com/zen") as act:
        try:
            print("  [net] Fetching GitHub zen...")
            req = urllib.request.urlopen("https://api.github.com/zen", timeout=10)
            data["github_zen"] = req.read().decode().strip()
            print(f"  [net] Got: {data['github_zen']}")
            act.set_output(data["github_zen"])
        except Exception as e:
            print(f"  [net] Failed: {e}")
            act.set_output(f"error: {e}")

    time.sleep(0.5)

    with session.action("network_request", "httpbin_ip",
                        input_summary="GET https://httpbin.org/ip") as act:
        try:
            print("  [net] Fetching public IP...")
            req = urllib.request.urlopen("https://httpbin.org/ip", timeout=10)
            data["public_ip"] = json.loads(req.read().decode())
            print(f"  [net] Got: {data['public_ip']}")
            act.set_output(json.dumps(data["public_ip"]))
        except Exception as e:
            print(f"  [net] Failed: {e}")
            act.set_output(f"error: {e}")

    return data


def task_llm_analysis(session, system_info, external_data, call_llm, provider_name, api_url):
    """Send gathered data to an LLM for analysis."""
    prompt = f"""You are a system analysis assistant. Analyze this data and provide a brief security assessment.

System Info:
- Hostname: {system_info.get('/etc/hostname', 'unknown')}
- OS: {system_info.get('/etc/os-release', 'unknown')[:200]}
- DNS: {system_info.get('/etc/resolv.conf', 'unknown')[:100]}

External Data:
- Public IP: {json.dumps(external_data.get('public_ip', {}))}
- GitHub Zen: {external_data.get('github_zen', 'N/A')}

Provide:
1. A one-paragraph security assessment
2. 3 recommendations
Keep it concise (under 200 words)."""

    with session.action("llm_call", f"{provider_name}.chat",
                        input_summary=f"POST {api_url}") as act:
        try:
            print(f"  [llm] Calling {provider_name}...")
            response = call_llm(prompt)
            print(f"  [llm] Got {len(response)} chars")
            act.set_output(response[:500])
            return response
        except Exception as e:
            print(f"  [llm] Failed: {e}")
            act.set_output(f"error: {e}")
            return f"LLM analysis failed: {e}"


def task_write_report(session, analysis, system_info, external_data):
    """Write the analysis report to a file."""
    report = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "system_info": {
            "hostname": system_info.get("/etc/hostname", "unknown"),
            "dns_servers": system_info.get("/etc/resolv.conf", "unknown")[:100],
        },
        "external_data": external_data,
        "llm_analysis": analysis,
    }

    report_path = os.path.join(WORK_DIR, "security-report.json")

    with session.action("file_write", "write_report",
                        input_summary=report_path) as act:
        os.makedirs(WORK_DIR, exist_ok=True)
        with open(report_path, "w") as f:
            json.dump(report, f, indent=2)
        print(f"  [write] {report_path}")
        act.set_output(f"Wrote report ({len(json.dumps(report))} bytes)")

    # Also write a human-readable summary
    summary_path = os.path.join(WORK_DIR, "summary.txt")

    with session.action("file_write", "write_summary",
                        input_summary=summary_path) as act:
        with open(summary_path, "w") as f:
            f.write(f"Argus Security Report\n{'=' * 40}\n\n")
            f.write(f"Generated: {report['timestamp']}\n\n")
            f.write(f"Analysis:\n{analysis}\n")
        print(f"  [write] {summary_path}")
        act.set_output(f"Wrote summary")

    return report_path


def main():
    provider_name, call_llm, api_url = get_llm_provider()

    if not provider_name:
        print("ERROR: No LLM API key found.")
        print("Set one of: ANTHROPIC_API_KEY, GROQ_API_KEY, GEMINI_API_KEY")
        sys.exit(1)

    print("=" * 60)
    print(f"  Argus Real Agent — Security Research Assistant")
    print(f"  LLM Provider: {provider_name}")
    print("=" * 60)

    session = ArgusSession("security-researcher", api_url=ARGUS_API)
    session.start()

    try:
        # Phase 1: Gather information
        print("\n[Phase 1] Gathering system information...")
        system_info = task_gather_system_info(session)
        time.sleep(1)

        # Phase 2: Fetch external data
        print("\n[Phase 2] Fetching external data...")
        external_data = task_fetch_external_data(session)
        time.sleep(1)

        # Phase 3: LLM analysis
        print("\n[Phase 3] Running LLM analysis...")
        analysis = task_llm_analysis(
            session, system_info, external_data,
            call_llm, provider_name, api_url
        )
        time.sleep(1)

        # Phase 4: Write report
        print("\n[Phase 4] Writing report...")
        report_path = task_write_report(session, analysis, system_info, external_data)

        print(f"\n{'=' * 60}")
        print(f"  Agent complete. Report at: {report_path}")
        print(f"  Check Argus dashboard for correlated events.")
        print(f"{'=' * 60}")

    finally:
        session.end()


if __name__ == "__main__":
    main()
