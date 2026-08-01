#!/usr/bin/env python3
"""Buzz ACP bridge for iii — natural LLM replies + channel publish via buzz CLI."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
import traceback
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

PROTOCOL_VERSION = 2
CLIENT_NAME = "iii-buzz-acp"
CLIENT_VERSION = "0.4.0"
DEFAULT_III_BIN = os.environ.get("III_ACP_III_BIN", os.path.expanduser("~/.local/bin/iii"))
DEFAULT_BUZZ_BIN = os.environ.get("III_ACP_BUZZ_BIN", os.path.expanduser("~/.local/bin/buzz"))
TRACKER_ROOT = os.environ.get("III_ACP_TRACKER_ROOT", os.path.expanduser("~/activity-feed"))
TRACKER_SCRIPT = os.environ.get(
    "III_ACP_TRACKER_SCRIPT",
    os.path.join(TRACKER_ROOT, "tools/experiment-tracker/experiment_tracker.py"),
)
MAX_RESULTS = int(os.environ.get("III_ACP_MAX_RESULTS", "3"))
MAX_LINE_CHARS = int(os.environ.get("III_ACP_MAX_LINE_CHARS", "320"))
MAX_RESPONSE_CHARS = int(os.environ.get("III_ACP_MAX_RESPONSE_CHARS", "4000"))

CHANNEL_RE = re.compile(
    r"Channel:\s*(?P<name>[^\n(#]+?)?\s*\(#(?P<uuid>[0-9a-fA-F-]{36})\)"
)
EVENT_ID_RE = re.compile(r"(?:Event ID:|--reply-to)\s*(?P<id>[0-9a-fA-F]{64})")
CONTENT_RE = re.compile(r"^Content:\s*(?P<content>[\s\S]*)$", re.MULTILINE)
FROM_HEX_RE = re.compile(r"hex:\s*(?P<hex>[0-9a-fA-F]{64})")
BUZZ_EVENT_RE = re.compile(
    r"\[Buzz event:[^\]]*\](?P<body>.*?)(?=\n\[|\Z)",
    re.DOTALL,
)


@dataclass
class BuzzEventContext:
    channel_id: str | None = None
    channel_name: str | None = None
    event_id: str | None = None
    reply_to: str | None = None
    content: str | None = None
    from_pubkey: str | None = None
    raw_prompt: str = ""


@dataclass
class SessionState:
    cwd: str | None = None
    project: str | None = None
    system_prompt: str | None = None
    session_title: str | None = None
    agentmemory_session_id: str | None = None
    prompt_count: int = 0
    experiment_stage: str | None = None
    idea_id: str | None = None
    experiment_id: str | None = None
    pending_name: str | None = None
    pending_summary: str | None = None
    pending_capture_text: str | None = None
    pending_intake_text: str | None = None
    last_recommendation: str | None = None
    created_at: float = field(default_factory=time.time)


SESSIONS: dict[str, SessionState] = {}
PUBLISHED_REPLY_TO: set[str] = set()


EXPERIMENT_TRIGGER_RE = re.compile(
    r"\b(experiment|experiments|new idea|new agent|research agent|scope this|intake|discovery)\b",
    re.IGNORECASE,
)
YES_RE = re.compile(r"^(yes|yeah|yep|sure|ok|okay|do it|create it|approve)\b", re.IGNORECASE)
NO_RE = re.compile(r"^(no|nope|not now|skip)\b", re.IGNORECASE)
IDEA_ID_RE = re.compile(r"\bidea-\d{3}\b", re.IGNORECASE)
EXPERIMENT_ID_RE = re.compile(r"\b[a-z0-9-]+-\d{2}\b")
LIVE_LOG_PATH = Path(os.environ.get("III_ACP_LIVE_LOG_PATH", "/tmp/iii-buzz-acp-live.log"))



def live_log(message: str) -> None:
    try:
        LIVE_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with LIVE_LOG_PATH.open("a", encoding="utf-8") as fh:
            fh.write(f"{now_iso()} {message}\n")
    except Exception:
        pass



def send(obj: dict[str, Any]) -> None:
    try:
        sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
        sys.stdout.flush()
    except BrokenPipeError:
        raise SystemExit(0)


def send_result(msg_id: Any, result: Any) -> None:
    send({"jsonrpc": "2.0", "id": msg_id, "result": result})


def send_error(msg_id: Any, code: int, message: str, data: Any = None) -> None:
    payload: dict[str, Any] = {
        "jsonrpc": "2.0",
        "id": msg_id,
        "error": {"code": code, "message": message},
    }
    if data is not None:
        payload["error"]["data"] = data
    send(payload)


def notify_update(session_id: str, update_type: str, text: str) -> None:
    send(
        {
            "jsonrpc": "2.0",
            "method": "session/update",
            "params": {
                "sessionId": session_id,
                "update": {
                    "sessionUpdate": update_type,
                    "content": {"type": "text", "text": text},
                },
            },
        }
    )


def trim(text: str, limit: int = MAX_LINE_CHARS) -> str:
    text = " ".join(str(text).split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def iii_json(function_id: str, payload: dict[str, Any], timeout_s: int = 20) -> Any:
    cmd = [DEFAULT_III_BIN, "trigger", function_id, "--json", json.dumps(payload)]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_s)
    if proc.returncode != 0:
        stderr = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(f"iii trigger failed for {function_id}: {trim(stderr, 500)}")
    stdout = proc.stdout.strip()
    if not stdout:
        return None
    return json.loads(stdout)


def iii_api(function_id: str, body: dict[str, Any], timeout_s: int = 20) -> Any:
    return iii_json(function_id, {"body": body}, timeout_s=timeout_s)


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def infer_project(cwd: str | None) -> str:
    if cwd:
        name = os.path.basename(cwd.rstrip("/"))
        if name:
            return name
    return os.environ.get("III_ACP_PROJECT", "activity-feed")


def observe(session_id: str, hook_type: str, data: dict[str, Any], cwd: str | None, project: str | None) -> None:
    try:
        iii_json(
            "mem::observe",
            {
                "sessionId": session_id,
                "hookType": hook_type,
                "timestamp": now_iso(),
                "project": project,
                "cwd": cwd,
                "data": data,
            },
            timeout_s=15,
        )
    except Exception:
        return


def pull_working_context() -> str | None:
    try:
        result = iii_json("mem::working-context", {}, timeout_s=15)
        if isinstance(result, dict) and result.get("success") and result.get("context"):
            return str(result["context"])
    except Exception:
        return None
    return None


def pull_next_suggestion(project: str | None) -> str | None:
    try:
        result = iii_json("mem::next", {"project": project}, timeout_s=15)
        if isinstance(result, dict):
            suggestion = result.get("suggestion")
            if isinstance(suggestion, dict):
                title = str(suggestion.get("title") or "").strip()
                desc = str(suggestion.get("description") or "").strip()
                if title and desc:
                    return f"{title}: {trim(desc, 220)}"
                if title:
                    return title
            message = str(result.get("message") or "").strip()
            if message:
                return trim(message, 220)
    except Exception:
        return None
    return None


def pull_session_context(session_id: str, project: str) -> str | None:
    try:
        result = iii_api("api::context", {"sessionId": session_id, "project": project}, timeout_s=20)
        body = result.get("body") if isinstance(result, dict) else None
        if isinstance(body, dict) and body.get("context"):
            return str(body["context"])
    except Exception:
        return None
    return None


def summarize_search_hit(hit: dict[str, Any]) -> str | None:
    obs = hit.get("observation") if isinstance(hit, dict) else None
    if not isinstance(obs, dict):
        return None
    title = str(obs.get("title") or "").strip()
    facts = obs.get("facts")
    if isinstance(facts, list) and facts:
        fact = trim(str(facts[0]), 220)
        return f"{title or 'memory'} — {fact}" if fact else title
    narrative = str(obs.get("narrative") or "").strip()
    if narrative:
        return f"{title or 'memory'} — {trim(narrative, 220)}"
    files = obs.get("files")
    if isinstance(files, list) and files:
        return f"{title or 'memory'} — file: {files[0]}"
    return title or None


def pull_search(query: str, project: str | None = None, cwd: str | None = None) -> list[str]:
    try:
        payload: dict[str, Any] = {"query": query}
        if project:
            payload["project"] = project
        if cwd:
            payload["cwd"] = cwd
        result = iii_json("mem::search", payload, timeout_s=20)
    except Exception as exc:
        return [f"search unavailable: {trim(str(exc), 220)}"]
    if not isinstance(result, dict):
        return []
    raw = result.get("results")
    if not isinstance(raw, list):
        return []

    keywords = {
        token.lower()
        for token in query.replace("/", " ").replace("-", " ").split()
        if len(token) >= 3
        and token.lower()
        not in {"what", "about", "does", "know", "with", "from", "that", "this", "bridge", "hello", "say"}
    }

    ranked: list[str] = []
    fallback: list[str] = []
    for hit in raw[: max(MAX_RESULTS * 4, 8)]:
        line = summarize_search_hit(hit)
        if not line:
            continue
        lower = line.lower()
        if keywords and any(word in lower for word in keywords):
            ranked.append(line)
        else:
            fallback.append(line)

    return (ranked or fallback)[:MAX_RESULTS]


def extract_prompt_text(params: dict[str, Any]) -> str:
    prompt = params.get("prompt")
    if isinstance(prompt, list):
        blocks: list[str] = []
        for block in prompt:
            if isinstance(block, dict) and block.get("type") == "text":
                text = block.get("text")
                if isinstance(text, str):
                    blocks.append(text)
        return "\n\n".join(blocks).strip()
    return ""


def parse_buzz_event(prompt_text: str) -> BuzzEventContext:
    ctx = BuzzEventContext(raw_prompt=prompt_text)

    channel_match = CHANNEL_RE.search(prompt_text)
    if channel_match:
        ctx.channel_id = channel_match.group("uuid")
        name = (channel_match.group("name") or "").strip()
        ctx.channel_name = name or None

    reply_match = EVENT_ID_RE.search(prompt_text)
    if reply_match:
        event_id = reply_match.group("id")
        ctx.event_id = event_id
        ctx.reply_to = event_id

    from_match = FROM_HEX_RE.search(prompt_text)
    if from_match:
        ctx.from_pubkey = from_match.group("hex")

    buzz_body = BUZZ_EVENT_RE.search(prompt_text)
    body = buzz_body.group("body") if buzz_body else prompt_text
    content_match = CONTENT_RE.search(body)
    if content_match:
        content = content_match.group("content")
        content = re.split(r"\n(?:Tags:|Parsed:)", content, maxsplit=1)[0]
        ctx.content = content.strip()
    else:
        for line in reversed(prompt_text.splitlines()):
            stripped = line.strip()
            if stripped.lower().startswith("content:"):
                ctx.content = stripped.split(":", 1)[1].strip()
                break

    return ctx


def is_casual_chitchat(text: str) -> bool:
    cleaned = re.sub(r"@\w+", "", text, flags=re.IGNORECASE)
    cleaned = re.sub(r"[^\w\s']", " ", cleaned).strip().lower()
    cleaned = re.sub(r"\s+", " ", cleaned)
    if not cleaned:
        return False
    phrases = {
        "hi", "hello", "hey", "yo", "sup", "howdy",
        "hi there", "hey there", "hello there",
        "whats up", "what's up", "what up", "wassup",
        "how are you", "hows it going", "how's it going", "how goes it",
        "good morning", "good afternoon", "good evening",
        "say hi", "say hello", "say hey",
    }
    if cleaned in phrases:
        return True
    tokens = cleaned.split()
    greetings = {"hi", "hello", "hey", "yo", "sup", "howdy"}
    return all(t in greetings or t in {"there", "again", "please", "say"} for t in tokens)


def tracker_available() -> bool:
    return Path(TRACKER_SCRIPT).exists()


def tracker_cli(*args: str) -> str:
    cmd = [sys.executable, TRACKER_SCRIPT, "--root", TRACKER_ROOT, *args]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=40)
    stdout = (proc.stdout or "").strip()
    stderr = (proc.stderr or "").strip()
    if proc.returncode != 0:
        raise RuntimeError(trim(stderr or stdout or "tracker call failed", 500))
    return stdout


def parse_named_fields(text: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip().lstrip("-*• ").strip()
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip().lower()
        value = value.strip()
        if value:
            fields[key] = value
    return fields


def infer_name(text: str) -> str | None:
    fields = parse_named_fields(text)
    if fields.get("name"):
        return fields["name"]
    lowered = text.strip()
    match = re.search(r"(?:new idea|new experiment|try|build|create)\s+(?:a|an)?\s*(.+)", lowered, re.IGNORECASE)
    if match:
        candidate = trim(match.group(1).strip(" .!?"), 80)
        if candidate:
            return candidate[:80]
    return None


def infer_summary(text: str) -> str:
    fields = parse_named_fields(text)
    if fields.get("summary"):
        return fields["summary"]
    cleaned = " ".join(text.strip().split())
    return trim(cleaned, 180)


def extract_id(reply: str, prefix: str) -> str | None:
    pattern = IDEA_ID_RE if prefix == "idea" else EXPERIMENT_ID_RE
    match = pattern.search(reply)
    if match:
        return match.group(0)
    return None


def build_capture_text(state: SessionState, user_text: str) -> str:
    fields = parse_named_fields(user_text)
    name = fields.get("name") or state.pending_name or infer_name(user_text)
    summary = fields.get("summary") or state.pending_summary or infer_summary(user_text)
    lines = [f"new idea: {name or 'Untitled experiment idea'}"]
    if fields.get("type"):
        lines.append(f"type: {fields['type']}")
    elif "agent" in user_text.lower():
        lines.append("type: agent")
    if summary:
        lines.append(f"summary: {summary}")
    for key in ["why now", "goal", "success signal", "stop signal", "repo path", "review", "owner"]:
        if fields.get(key):
            lines.append(f"{key}: {fields[key]}")
    return "\n".join(lines)


def build_discovery_text(user_text: str) -> str:
    fields = parse_named_fields(user_text)
    lines: list[str] = []
    for key in ["problem", "desired outcome", "decision", "current workflow", "recommendation"]:
        if fields.get(key):
            lines.append(f"{key}: {fields[key]}")
    for multi in ["constraint", "github project", "web resource", "inspiration", "open question", "note"]:
        if fields.get(multi):
            lines.append(f"{multi}: {fields[multi]}")
    if not lines:
        lines.append(f"note: {infer_summary(user_text)}")
    return "\n".join(lines)


def build_intake_text(user_text: str) -> str:
    fields = parse_named_fields(user_text)
    lines: list[str] = []
    for key in [
        "goal", "success signal", "stop signal", "repo path", "review",
        "duplicate of", "recommendation", "risk level", "eval plan",
    ]:
        if fields.get(key):
            lines.append(f"{key}: {fields[key]}")
    if fields.get("test task"):
        lines.append(f"test task: {fields['test task']}")
    if fields.get("missing"):
        lines.append(f"missing: {fields['missing']}")
    if fields.get("risk"):
        lines.append(f"risk: {fields['risk']}")
    if fields.get("note"):
        lines.append(f"note: {fields['note']}")
    if not lines:
        lines.append(f"note: {infer_summary(user_text)}")
    return "\n".join(lines)


def experiment_help_message() -> str:
    return (
        "I can run the experiment flow here in chat. Reply in plain words or simple fields.\n"
        "1. name: what should we call it?\n"
        "2. summary: what are you trying?\n"
        "3. why now: what decision should this inform?\n"
        "4. success signal: what counts as a win?\n"
        "5. stop signal: when do we stop?\n"
        "6. repo path: where does it live?\n"
        "7. review: when should we check in?"
    )


def maybe_experiment_turn(user_text: str, buzz: BuzzEventContext, state: SessionState) -> str | None:
    text = user_text.strip()
    lower = text.lower()
    in_experiments_channel = (buzz.channel_name or "").strip().lower() == "experiments"
    wants_experiment = bool(EXPERIMENT_TRIGGER_RE.search(text))
    active_flow = bool(state.experiment_stage or state.idea_id or state.experiment_id)

    if not tracker_available():
        if in_experiments_channel or wants_experiment or active_flow:
            return "The experiment tracker backend is not available on this machine yet."
        return None

    if not (in_experiments_channel or wants_experiment or active_flow):
        return None

    if state.experiment_stage == "awaiting_capture":
        capture_text = build_capture_text(state, text)
        reply = tracker_cli("capture", "--text", capture_text)
        state.idea_id = extract_id(reply, "idea")
        state.pending_capture_text = capture_text
        state.pending_name = infer_name(text)
        state.pending_summary = infer_summary(text)
        state.experiment_stage = "awaiting_discovery_confirm"
        return (
            f"{reply}\n\n"
            "Next: do you want discovery first? Say `yes` and I’ll open the discovery stage, or say `skip discovery` and I’ll move to intake."
        )

    if state.experiment_stage == "awaiting_discovery_confirm":
        if NO_RE.search(lower) or "skip" in lower:
            state.experiment_stage = "awaiting_intake"
            return (
                "Okay — moving to intake.\n"
                "Reply with what you know using any of these fields: goal, success signal, stop signal, repo path, review, eval plan, test task, recommendation."
            )
        if YES_RE.search(lower) or lower in {"discovery", "research"} or "do discovery" in lower or "research this" in lower:
            state.experiment_stage = "awaiting_discovery"
            return (
                "Good call. Reply with any discovery notes you already have, or just say what you want researched.\n"
                "Helpful fields: problem, desired outcome, decision, github project, inspiration, constraint, open question, recommendation."
            )
        return "Reply `yes` to do discovery first, or `skip discovery` to jump straight to intake."

    if state.experiment_stage == "awaiting_discovery":
        if not state.idea_id:
            state.experiment_stage = None
            return "I lost the current idea id. Start again with `new experiment` and I’ll reopen the flow."
        reply = tracker_cli("discover", "--id", state.idea_id, "--text", build_discovery_text(text))
        state.experiment_stage = "awaiting_intake"
        return (
            f"{reply}\n\n"
            "Next: reply with intake details. Helpful fields: goal, success signal, stop signal, repo path, review, eval plan, test task, recommendation."
        )

    if state.experiment_stage == "awaiting_intake":
        if not state.idea_id:
            state.experiment_stage = None
            return "I lost the current idea id. Start again with `new experiment` and I’ll reopen the flow."
        reply = tracker_cli("intake", "--id", state.idea_id, "--text", build_intake_text(text))
        rec_match = re.search(r"Recommendation:\s*(\w+)", reply)
        state.last_recommendation = rec_match.group(1) if rec_match else None
        if state.last_recommendation == "ready":
            state.experiment_stage = "awaiting_create_confirm"
            return f"{reply}\n\nThis looks ready. Say `create it` if you want me to register the experiment now."
        return f"{reply}\n\nFill any missing pieces and I’ll rerun intake."

    if state.experiment_stage == "awaiting_create_confirm":
        if YES_RE.search(lower) or "create" in lower or "approve" in lower:
            if not state.idea_id:
                state.experiment_stage = None
                return "I lost the current idea id. Start again with `new experiment` and I’ll reopen the flow."
            reply = tracker_cli("create", "--id", state.idea_id)
            state.experiment_id = extract_id(reply, "experiment")
            state.experiment_stage = "active_experiment"
            return f"{reply}\n\nYou can update it here anytime with notes like `status: paused` or `summary: waiting on runtime fixes`."
        if NO_RE.search(lower):
            state.experiment_stage = "awaiting_intake"
            return "Okay — not creating it yet. Reply with more intake details any time."
        return "Say `create it` to register the experiment, or `no` to keep editing intake."

    if state.experiment_stage == "active_experiment" and state.experiment_id:
        fields = parse_named_fields(text)
        if fields or lower.startswith(("pause", "resume", "done", "kill", "note", "status")):
            update_lines: list[str] = []
            if lower.startswith("pause") and "status" not in fields:
                update_lines.append("status: paused")
            elif lower.startswith("resume") and "status" not in fields:
                update_lines.append("status: active")
            elif lower.startswith("done") and "status" not in fields:
                update_lines.append("status: done")
            elif lower.startswith("kill") and "status" not in fields:
                update_lines.append("status: killed")
            for key, value in fields.items():
                update_lines.append(f"{key}: {value}")
            if not update_lines:
                update_lines.append(f"summary: {infer_summary(text)}")
            reply = tracker_cli("update", "--id", state.experiment_id, "--text", "\n".join(update_lines))
            return reply

    if text.lower().startswith(("new experiment", "new idea")) or wants_experiment or in_experiments_channel:
        state.experiment_stage = "awaiting_capture"
        state.idea_id = None
        state.experiment_id = None
        state.pending_name = infer_name(text)
        state.pending_summary = infer_summary(text)
        return (
            "Let’s turn this into an experiment the chat-first way.\n\n"
            f"{experiment_help_message()}"
        )

    return None


def load_llm_config() -> dict[str, str]:
    cfg = {
        "base_url": os.environ.get("OPENAI_BASE_URL", "").rstrip("/"),
        "api_key": os.environ.get("OPENAI_API_KEY", ""),
        "model": os.environ.get("OPENAI_MODEL", ""),
    }
    env_path = Path(os.path.expanduser("~/.agentmemory/.env"))
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            value = value.strip().strip('"').strip("'")
            if key == "OPENAI_BASE_URL" and not cfg["base_url"]:
                cfg["base_url"] = value.rstrip("/")
            elif key == "OPENAI_API_KEY" and not cfg["api_key"]:
                cfg["api_key"] = value
            elif key == "OPENAI_MODEL" and not cfg["model"]:
                cfg["model"] = value
    if not cfg["base_url"]:
        cfg["base_url"] = "http://127.0.0.1:11434/v1"
    if not cfg["model"]:
        cfg["model"] = "code-chat"
    if not cfg["api_key"]:
        cfg["api_key"] = "local"
    return cfg


def gather_memory_context(query: str, state: SessionState) -> str:
    matches = pull_search(query, project=state.project, cwd=state.cwd)
    next_step = pull_next_suggestion(state.project)
    session_context = (
        pull_session_context(state.agentmemory_session_id or "", state.project or "")
        if state.agentmemory_session_id and state.project
        else None
    )
    working_context = pull_working_context()

    parts: list[str] = []
    if matches:
        parts.append("Relevant memory:")
        for item in matches:
            if "iii_buzz_acp_response" in item or item.startswith("prompt_submit"):
                continue
            parts.append(f"- {item}")
    if session_context:
        parts.append("Session context:")
        parts.append(trim(session_context, 1200))
    elif working_context:
        parts.append("Working context:")
        parts.append(trim(working_context, 900))
    if next_step and "No actionable work" not in next_step:
        parts.append(f"Suggested next step: {next_step}")
    return "\n".join(parts).strip()


def llm_chat(messages: list[dict[str, str]], timeout_s: int = 45) -> str:
    cfg = load_llm_config()
    payload = {
        "model": cfg["model"],
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 500,
    }
    req = urllib.request.Request(
        cfg["base_url"] + "/chat/completions",
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {cfg['api_key']}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"LLM HTTP {exc.code}: {trim(body, 300)}") from exc
    choices = data.get("choices") if isinstance(data, dict) else None
    if not isinstance(choices, list) or not choices:
        raise RuntimeError(f"LLM returned no choices: {trim(data, 300)}")
    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("LLM returned empty content")
    return content.strip()


def build_agent_reply(prompt_text: str, buzz: BuzzEventContext, state: SessionState) -> str:
    user_text = (buzz.content or "").strip() or trim(prompt_text, 500)
    memory_context = gather_memory_context(user_text, state)

    system = (
        "You are iii, Ben's practical workflow/memory agent chatting inside Buzz.\n"
        "Reply like a real teammate in chat: natural, concise, useful.\n"
        "Rules:\n"
        "- 1-4 short sentences unless the user asks for detail.\n"
        "- Do NOT dump raw memory lists, observation IDs, prompt_submit rows, or bridge internals.\n"
        "- Do NOT say 'Got it — looking at' or 'From iii memory'.\n"
        "- Use memory context only when it helps answer; otherwise just talk normally.\n"
        "- If this is casual chitchat (hi / what's up), reply casually and invite a real ask.\n"
        "- Prefer concrete next steps over generic filler."
    )
    user_block = f"User message:\n{user_text}"
    if memory_context:
        user_block += f"\n\nOptional private memory context (do not dump verbatim):\n{memory_context}"

    try:
        reply = llm_chat(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": user_block},
            ]
        )
    except Exception as exc:
        if is_casual_chitchat(user_text):
            return "Hey — not much, just here. What do you want to dig into?"
        return (
            f"I hit a snag generating a full reply ({trim(str(exc), 160)}). "
            "Try me again, or point me at a specific project/thread."
        )

    if len(reply) > MAX_RESPONSE_CHARS:
        reply = reply[: MAX_RESPONSE_CHARS - 1].rstrip() + "…"
    return reply


def buzz_env() -> dict[str, str]:
    env = os.environ.copy()
    relay = env.get("BUZZ_RELAY_URL", "")
    if relay.startswith("wss://"):
        env["BUZZ_RELAY_URL"] = "https://" + relay[len("wss://") :]
    elif relay.startswith("ws://"):
        env["BUZZ_RELAY_URL"] = "http://" + relay[len("ws://") :]
    return env



REPLY_LOCK_DIR = Path(
    os.environ.get("III_ACP_REPLY_LOCK_DIR", "/tmp/iii-buzz-acp-reply-locks")
)
REPLY_LOCK_STALE_S = float(os.environ.get("III_ACP_REPLY_LOCK_STALE_S", "180"))


def reply_lock_path(reply_to: str) -> Path:
    return REPLY_LOCK_DIR / reply_to



def claim_reply_slot(reply_to: str | None) -> bool:
    """Cross-process claim so only one agent pool worker publishes a reply.

    buzz-acp often runs N separate iii_buzz_acp.py processes; an in-memory set
    cannot dedupe across them. O_EXCL lock files can.
    """
    if not reply_to:
        return True
    if reply_to in PUBLISHED_REPLY_TO:
        return False
    REPLY_LOCK_DIR.mkdir(parents=True, exist_ok=True)
    lock_path = reply_lock_path(reply_to)
    for _ in range(2):
        try:
            fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
            try:
                os.write(fd, f"{os.getpid()}\n{time.time()}\n".encode())
            finally:
                os.close(fd)
            PUBLISHED_REPLY_TO.add(reply_to)
            return True
        except FileExistsError:
            try:
                age = time.time() - lock_path.stat().st_mtime
            except FileNotFoundError:
                continue
            if age < REPLY_LOCK_STALE_S:
                return False
            # Stale claim (crashed mid-turn) — steal once.
            try:
                lock_path.unlink(missing_ok=True)
            except OSError:
                return False
    return False



def release_reply_slot(reply_to: str | None) -> None:
    if not reply_to:
        return
    PUBLISHED_REPLY_TO.discard(reply_to)
    try:
        reply_lock_path(reply_to).unlink(missing_ok=True)
    except Exception:
        pass



def already_replied_to(channel_id: str, reply_to: str | None) -> bool:
    """Idempotent publish guard for duplicate harnesses / double dispatch.

    Only trust real channel history here. In-memory publish state can go stale if a
    previous worker claimed a slot but died before a visible post landed.
    """
    if not reply_to:
        return False
    cmd = [
        DEFAULT_BUZZ_BIN,
        "messages",
        "get",
        "--channel",
        channel_id,
        "--limit",
        "40",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=20, env=buzz_env())
    if proc.returncode != 0:
        return False
    try:
        msgs = json.loads(proc.stdout or "[]")
    except json.JSONDecodeError:
        return False
    # Derive our pubkey once via `buzz users get` (no args = me)
    me = subprocess.run(
        [DEFAULT_BUZZ_BIN, "users", "get"],
        capture_output=True,
        text=True,
        timeout=15,
        env=buzz_env(),
    )
    my_pubkey = None
    if me.returncode == 0 and me.stdout.strip():
        try:
            profile = json.loads(me.stdout)
            if isinstance(profile, list) and profile:
                my_pubkey = profile[0].get("pubkey")
            elif isinstance(profile, dict):
                my_pubkey = profile.get("pubkey")
        except json.JSONDecodeError:
            my_pubkey = None
    for msg in msgs if isinstance(msgs, list) else []:
        if not isinstance(msg, dict):
            continue
        if my_pubkey and msg.get("pubkey") != my_pubkey:
            continue
        for tag in msg.get("tags") or []:
            if isinstance(tag, list) and len(tag) >= 2 and tag[0] == "e" and tag[1] == reply_to:
                PUBLISHED_REPLY_TO.add(reply_to)
                return True
    return False

def publish_channel_reply(
    *,
    channel_id: str,
    content: str,
    reply_to: str | None,
    mention: str | None = None,
) -> dict[str, Any]:
    if not os.environ.get("BUZZ_PRIVATE_KEY"):
        raise RuntimeError("BUZZ_PRIVATE_KEY missing — cannot publish channel reply")

    cmd = [
        DEFAULT_BUZZ_BIN,
        "messages",
        "send",
        "--channel",
        channel_id,
        "--content",
        "-",
    ]
    if reply_to:
        cmd.extend(["--reply-to", reply_to])
    if mention:
        cmd.extend(["--mention", mention])

    proc = subprocess.run(
        cmd,
        input=content,
        capture_output=True,
        text=True,
        timeout=30,
        env=buzz_env(),
    )
    stdout = (proc.stdout or "").strip()
    stderr = (proc.stderr or "").strip()
    if proc.returncode != 0:
        raise RuntimeError(f"buzz messages send failed: {trim(stderr or stdout, 500)}")
    if not stdout:
        return {"accepted": True}
    try:
        return json.loads(stdout)
    except json.JSONDecodeError:
        return {"accepted": True, "raw": stdout}



def emergency_publish_failure_notice(
    *, channel_id: str | None, reply_to: str | None, from_pubkey: str | None, error_text: str
) -> dict[str, Any] | None:
    if not channel_id:
        return None
    fallback = (
        "I hit a bridge error before I could send the full reply. "
        f"Error: {trim(error_text, 220)}"
    )
    try:
        return publish_channel_reply(
            channel_id=channel_id,
            content=fallback,
            reply_to=reply_to,
            mention=from_pubkey,
        )
    except Exception as exc:
        live_log(
            f"emergency_publish_failed channel={channel_id} reply_to={reply_to} error={trim(str(exc), 300)}"
        )
        return None


def handle_initialize(msg_id: Any, _params: dict[str, Any]) -> None:
    send_result(
        msg_id,
        {
            "protocolVersion": PROTOCOL_VERSION,
            "agentCapabilities": {
                "loadSession": False,
                "promptCapabilities": {
                    "image": False,
                    "audio": False,
                    "embeddedContext": True,
                },
                "mcpCapabilities": {"http": False, "sse": False},
                "sessionCapabilities": {},
            },
            "agentInfo": {
                "name": CLIENT_NAME,
                "title": "iii Buzz Agent",
                "version": CLIENT_VERSION,
            },
            "serverInfo": {"name": CLIENT_NAME, "version": CLIENT_VERSION},
        },
    )


def handle_session_new(msg_id: Any, params: dict[str, Any]) -> None:
    session_id = f"iii-buzz-{uuid.uuid4()}"
    cwd = params.get("cwd") if isinstance(params.get("cwd"), str) else None
    project = infer_project(cwd)
    title = (params.get("_meta") or {}).get("sessionTitle") if isinstance(params.get("_meta"), dict) else None
    if not isinstance(title, str) or not title.strip():
        title = "Buzz iii agent"

    start_result = iii_api(
        "api::session::start",
        {
            "sessionId": session_id,
            "project": project,
            "cwd": cwd or os.getcwd(),
            "title": title,
        },
        timeout_s=20,
    )
    if not isinstance(start_result, dict) or start_result.get("status_code") != 200:
        raise RuntimeError(f"failed to start iii session: {trim(start_result, 500)}")

    state = SessionState(
        cwd=cwd,
        project=project,
        system_prompt=params.get("systemPrompt") if isinstance(params.get("systemPrompt"), str) else None,
        session_title=title,
        agentmemory_session_id=session_id,
    )
    SESSIONS[session_id] = state
    send_result(msg_id, {"sessionId": session_id})


def handle_session_prompt(msg_id: Any, params: dict[str, Any]) -> None:
    session_id = params.get("sessionId")
    if not isinstance(session_id, str) or session_id not in SESSIONS:
        send_error(msg_id, -32602, "unknown sessionId")
        return
    prompt_text = extract_prompt_text(params)
    if not prompt_text:
        send_error(msg_id, -32602, "session/prompt requires text prompt blocks")
        return

    state = SESSIONS[session_id]
    state.prompt_count += 1
    buzz = parse_buzz_event(prompt_text)
    reply_to = buzz.reply_to or buzz.event_id
    publish_result: dict[str, Any] | None = None
    publish_error: str | None = None
    claimed_slot = False
    response_text = ""

    live_log(
        f"turn_start session={session_id} channel={buzz.channel_id} channel_name={buzz.channel_name} "
        f"reply_to={reply_to} content={trim(buzz.content or prompt_text, 240)}"
    )

    observe(
        state.agentmemory_session_id or session_id,
        "prompt_submit",
        {"prompt": buzz.content or prompt_text},
        state.cwd,
        state.project,
    )

    try:
        if reply_to and not claim_reply_slot(reply_to):
            publish_error = f"skipped duplicate publish for event {reply_to}"
            live_log(f"turn_duplicate_claim session={session_id} reply_to={reply_to}")
            notify_update(session_id, "agent_thought_chunk", "Another worker already claimed this event — skipping.")
            notify_update(session_id, "agent_message_chunk", "(duplicate turn suppressed)")
            send_result(msg_id, {"stopReason": "end_turn"})
            return
        claimed_slot = bool(reply_to)

        if buzz.channel_id and already_replied_to(buzz.channel_id, reply_to):
            publish_error = f"skipped duplicate publish for event {reply_to}"
            live_log(f"turn_already_replied session={session_id} channel={buzz.channel_id} reply_to={reply_to}")
            notify_update(session_id, "agent_thought_chunk", "Reply already published — skipping duplicate.")
            notify_update(session_id, "agent_message_chunk", "(duplicate turn suppressed)")
            send_result(msg_id, {"stopReason": "end_turn"})
            return

        experiment_response = maybe_experiment_turn((buzz.content or prompt_text).strip(), buzz, state)
        if experiment_response is not None:
            response_text = experiment_response
            notify_update(session_id, "agent_thought_chunk", "Running experiment workflow…")
            live_log(f"turn_mode session={session_id} mode=experiment stage={state.experiment_stage}")
        else:
            notify_update(session_id, "agent_thought_chunk", "Thinking with iii memory + LLM…")
            response_text = build_agent_reply(prompt_text, buzz, state)
            live_log("turn_mode session={} mode=normal".format(session_id))

        if buzz.channel_id:
            try:
                notify_update(session_id, "agent_thought_chunk", "Publishing reply with buzz messages send…")
                publish_result = publish_channel_reply(
                    channel_id=buzz.channel_id,
                    content=response_text,
                    reply_to=reply_to,
                    mention=buzz.from_pubkey,
                )
                if reply_to:
                    PUBLISHED_REPLY_TO.add(reply_to)
                live_log(
                    f"publish_ok session={session_id} channel={buzz.channel_id} reply_to={reply_to} "
                    f"result={trim(json.dumps(publish_result, ensure_ascii=False), 240)}"
                )
            except Exception as exc:
                publish_error = str(exc)
                live_log(
                    f"publish_failed session={session_id} channel={buzz.channel_id} reply_to={reply_to} "
                    f"error={trim(publish_error, 300)}"
                )
                if claimed_slot:
                    release_reply_slot(reply_to)
                    claimed_slot = False
                emergency_result = emergency_publish_failure_notice(
                    channel_id=buzz.channel_id,
                    reply_to=reply_to,
                    from_pubkey=buzz.from_pubkey,
                    error_text=publish_error,
                )
                if emergency_result is not None:
                    publish_result = emergency_result
                    if reply_to:
                        PUBLISHED_REPLY_TO.add(reply_to)
                    live_log(
                        f"publish_emergency_ok session={session_id} channel={buzz.channel_id} reply_to={reply_to}"
                    )
                response_text = (
                    f"{response_text}\n\n"
                    f"(Failed to publish to channel: {trim(publish_error, 240)}. "
                    "ACP stream still has the reply above.)"
                )
        else:
            publish_error = "no channel id found in prompt — reply not published to Buzz"
            live_log(f"publish_skipped session={session_id} reason=no_channel reply_to={reply_to}")
            response_text = f"{response_text}\n\n({publish_error})"

        observe(
            state.agentmemory_session_id or session_id,
            "post_tool_use",
            {
                "tool_name": "iii_buzz_acp_response",
                "tool_input": buzz.content or prompt_text,
                "tool_output": response_text,
                "publish_result": publish_result,
                "publish_error": publish_error,
                "channel_id": buzz.channel_id,
                "reply_to": buzz.reply_to or buzz.event_id,
            },
            state.cwd,
            state.project,
        )

        notify_update(session_id, "agent_message_chunk", response_text)
        send_result(msg_id, {"stopReason": "end_turn"})
        live_log(f"turn_done session={session_id} reply_to={reply_to}")
    except Exception as exc:
        error_text = trim(str(exc), 300)
        live_log(
            f"turn_exception session={session_id} channel={buzz.channel_id} reply_to={reply_to} "
            f"error={error_text} traceback={trim(traceback.format_exc(limit=6), 1200)}"
        )
        if claimed_slot:
            release_reply_slot(reply_to)
        emergency_publish_failure_notice(
            channel_id=buzz.channel_id,
            reply_to=reply_to,
            from_pubkey=buzz.from_pubkey,
            error_text=error_text,
        )
        notify_update(session_id, "agent_message_chunk", f"Bridge error: {error_text}")
        send_result(msg_id, {"stopReason": "end_turn"})


def handle_session_cancel(msg_id: Any, _params: dict[str, Any]) -> None:
    if msg_id is not None:
        send_result(msg_id, {})


def close_sessions() -> None:
    for state in list(SESSIONS.values()):
        session_id = state.agentmemory_session_id
        if not session_id:
            continue
        try:
            iii_api("api::session::end", {"sessionId": session_id}, timeout_s=10)
        except Exception:
            pass


def dispatch(msg: dict[str, Any]) -> None:
    method = msg.get("method")
    msg_id = msg.get("id")
    params = msg.get("params") if isinstance(msg.get("params"), dict) else {}

    if method == "initialize":
        handle_initialize(msg_id, params)
    elif method == "session/new":
        handle_session_new(msg_id, params)
    elif method == "session/prompt":
        handle_session_prompt(msg_id, params)
    elif method == "session/cancel":
        handle_session_cancel(msg_id, params)
    elif method == "shutdown":
        if msg_id is not None:
            send_result(msg_id, {})
        raise SystemExit(0)
    elif msg_id is not None:
        send_error(msg_id, -32601, f"method not found: {method}")


def main() -> int:
    try:
        for raw in sys.stdin:
            line = raw.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
                if not isinstance(msg, dict):
                    continue
                dispatch(msg)
            except SystemExit:
                raise
            except Exception as exc:
                msg_id = None
                try:
                    maybe = json.loads(line)
                    if isinstance(maybe, dict):
                        msg_id = maybe.get("id")
                except Exception:
                    pass
                send_error(msg_id, -32000, str(exc), {"traceback": traceback.format_exc(limit=5)})
        return 0
    finally:
        close_sessions()


if __name__ == "__main__":
    raise SystemExit(main())
