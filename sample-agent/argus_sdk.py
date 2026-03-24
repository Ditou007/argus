"""
Argus Agent SDK — Lightweight Python SDK for agent observability.

Reports agent sessions and actions to the Argus API, enabling
correlation between high-level agent actions and kernel-level syscalls.

Usage:
    session = ArgusSession("my-agent", api_url="http://localhost:3001")
    session.start()

    with session.action("llm_call", "openai.chat.completions") as act:
        result = call_llm(...)
        act.set_output(str(result)[:500])

    session.end()
"""

import os
import json
import socket
import urllib.request
import urllib.error
from datetime import datetime, timezone
from contextlib import contextmanager


def _utcnow():
    return datetime.now(timezone.utc).isoformat()


def _post(url, data):
    """POST JSON to a URL. Returns parsed response or None on failure."""
    try:
        body = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode())
    except (urllib.error.URLError, OSError, json.JSONDecodeError) as e:
        print(f"[argus-sdk] Warning: API call failed ({url}): {e}")
        return None


def _patch(url, data=None):
    """PATCH JSON to a URL. Returns parsed response or None on failure."""
    try:
        body = json.dumps(data or {}).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="PATCH",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode())
    except (urllib.error.URLError, OSError, json.JSONDecodeError) as e:
        print(f"[argus-sdk] Warning: API call failed ({url}): {e}")
        return None


class ArgusAction:
    """Tracks a single agent action (LLM call, file read, tool use, etc.)."""

    def __init__(self, session_id, action_type, action_name, api_url, input_summary=None):
        self.session_id = session_id
        self.action_type = action_type
        self.action_name = action_name
        self.api_url = api_url
        self.input_summary = input_summary
        self.action_id = None
        self._output_summary = None

    def set_output(self, summary):
        """Set the output summary (call before exiting the context manager)."""
        self._output_summary = str(summary)[:1000] if summary else None

    def _start(self):
        result = _post(f"{self.api_url}/api/sessions/{self.session_id}/actions", {
            "action_type": self.action_type,
            "action_name": self.action_name,
            "input_summary": self.input_summary,
            "started_at": _utcnow(),
        })
        if result and "action" in result:
            self.action_id = result["action"]["id"]
            print(f"[argus-sdk] Action started: {self.action_type}/{self.action_name} ({self.action_id})")

    def _end(self):
        if not self.action_id:
            return
        result = _patch(f"{self.api_url}/api/sessions/actions/{self.action_id}/end", {
            "output_summary": self._output_summary,
        })
        if result and "correlation" in result:
            corr = result["correlation"]
            top = ", ".join(corr.get("top_signals", []))
            print(
                f"[argus-sdk] Action ended: {self.action_type}/{self.action_name} "
                f"-> {corr['events_correlated']} events correlated "
                f"(high={corr.get('high_confidence', 0)}, "
                f"med={corr.get('medium_confidence', 0)}, "
                f"low={corr.get('low_confidence', 0)})"
                f"{f' top: {top}' if top else ''}"
            )


class ArgusSession:
    """Tracks an agent session lifecycle."""

    def __init__(self, agent_name, api_url="http://localhost:3001"):
        self.agent_name = agent_name
        self.api_url = api_url.rstrip("/")
        self.session_id = None
        self.pid = os.getpid()
        self.host = socket.gethostname()
        # In K8s, HOSTNAME is set to the pod name by default.
        # ARGUS_POD_NAME can be set via Downward API for the exact pod name.
        self.pod_name = os.environ.get("ARGUS_POD_NAME", os.environ.get("HOSTNAME", ""))

    def start(self):
        """Register this session with the Argus API."""
        result = _post(f"{self.api_url}/api/sessions", {
            "agent_name": self.agent_name,
            "agent_pid": self.pid,
            "host_name": self.host,
            "pod_name": self.pod_name or None,
            "metadata": {
                "python_version": os.sys.version,
                "cwd": os.getcwd(),
            },
        })
        if result and "session" in result:
            self.session_id = result["session"]["id"]
            print(f"[argus-sdk] Session started: {self.agent_name} (PID {self.pid}, session {self.session_id})")
        return self

    def end(self):
        """Mark this session as ended."""
        if not self.session_id:
            return
        _patch(f"{self.api_url}/api/sessions/{self.session_id}/end")
        print(f"[argus-sdk] Session ended: {self.session_id}")

    @contextmanager
    def action(self, action_type, action_name=None, input_summary=None):
        """Context manager for tracking an action.

        Usage:
            with session.action("llm_call", "openai.chat") as act:
                result = openai.chat(...)
                act.set_output(str(result))
        """
        act = ArgusAction(
            session_id=self.session_id,
            action_type=action_type,
            action_name=action_name,
            api_url=self.api_url,
            input_summary=input_summary,
        )
        act._start()
        try:
            yield act
        finally:
            act._end()
