"""
LLM provider helpers shared by the Argus sample agents.

Extracted so both ``real_agent.py`` and ``long_running_agent.py`` use one
implementation (no copy-paste). Each provider call issues a real HTTPS request,
which is what generates the ``tcp_connect`` / ``tcp_sendmsg`` / ``fd_install``
syscalls Argus correlates to a declared ``llm_call`` action.

If no API key is configured, ``call_llm_best_effort`` still issues a real HTTPS
request to a provider host so the capture has network syscalls to correlate —
the agent's *behaviour* (the syscalls) is the point, not the LLM's answer.
"""

import json
import os
import urllib.error
import urllib.request
from typing import Callable, Optional, Tuple

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
_TIMEOUT = 30


def call_anthropic(prompt: str, model: str = "claude-haiku-4-5-20251001") -> Optional[str]:
    """Call the Anthropic Messages API. Returns text, or None if no key."""
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return None
    body = json.dumps({
        "model": model,
        "max_tokens": 500,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    req = urllib.request.Request(
        ANTHROPIC_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
        },
    )
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
        data = json.loads(resp.read().decode())
        return data["content"][0]["text"]


def call_groq(prompt: str, model: str = "llama-3.1-8b-instant") -> Optional[str]:
    """Call the Groq API (OpenAI-compatible). Returns text, or None if no key."""
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        return None
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 500,
    }).encode()
    req = urllib.request.Request(
        GROQ_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
            "User-Agent": "argus-agent/0.1",
        },
    )
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
        data = json.loads(resp.read().decode())
        return data["choices"][0]["message"]["content"]


def call_gemini(prompt: str, model: str = "gemini-2.0-flash") -> Optional[str]:
    """Call the Google Gemini API. Returns text, or None if no key."""
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        return None
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"maxOutputTokens": 500},
    }).encode()
    url = f"{GEMINI_BASE}/{model}:generateContent?key={key}"
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
        data = json.loads(resp.read().decode())
        return data["candidates"][0]["content"]["parts"][0]["text"]


def get_llm_provider() -> Tuple[Optional[str], Optional[Callable[[str], Optional[str]]], Optional[str]]:
    """Detect the configured provider. Returns (name, call_fn, api_url) or (None, None, None)."""
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic", call_anthropic, ANTHROPIC_URL
    if os.environ.get("GROQ_API_KEY"):
        return "groq", call_groq, GROQ_URL
    if os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"):
        return "gemini", call_gemini, GEMINI_BASE
    return None, None, None


def call_llm_best_effort(prompt: str) -> Tuple[str, str, str]:
    """Call the configured LLM, or — if no key — probe a provider host over HTTPS
    so the capture still has real network syscalls to correlate.

    Returns (provider_name, api_url, output_summary).
    """
    name, call_fn, api_url = get_llm_provider()
    if name and call_fn:
        try:
            response = call_fn(prompt)
            return name, api_url or "", (response or "")[:500]
        except (urllib.error.URLError, OSError, KeyError, ValueError) as e:
            return name, api_url or "", f"error: {e}"

    # No key — issue a real HTTPS request anyway so the syscalls exist.
    probe_url = ANTHROPIC_URL
    try:
        req = urllib.request.Request(probe_url, data=b"{}", headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return "probe", probe_url, f"probe status {resp.status}"
    except urllib.error.HTTPError as e:
        # A 401/400 still produced the connect/sendmsg syscalls — that's the point.
        return "probe", probe_url, f"probe http {e.code}"
    except (urllib.error.URLError, OSError) as e:
        return "probe", probe_url, f"probe error: {e}"
