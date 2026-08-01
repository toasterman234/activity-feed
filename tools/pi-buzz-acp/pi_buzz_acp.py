#!/usr/bin/env python3
"""Buzz ACP bridge for Pi — ACP in/out, Pi for thinking, buzz CLI for replies."""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import time
import traceback
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

PROTOCOL_VERSION = 2
CLIENT_NAME = "pi-buzz-acp"
CLIENT_VERSION = "0.1.3"
DEFAULT_PI_BIN = os.environ.get("PI_BUZZ_ACP_PI_BIN", os.path.expanduser("~/.local/bin/pi"))
DEFAULT_PI_CMD = os.environ.get("PI_BUZZ_ACP_PI_CMD", "").strip()
DEFAULT_BUZZ_BIN = os.environ.get("PI_BUZZ_ACP_BUZZ_BIN", os.path.expanduser("~/.local/bin/buzz"))
PI_TIMEOUT_S = int(os.environ.get("PI_BUZZ_ACP_TIMEOUT_S", "120"))
MAX_RESPONSE_CHARS = int(os.environ.get("PI_BUZZ_ACP_MAX_RESPONSE_CHARS", "4000"))

CHANNEL_RE = re.compile(r"Channel:\s*(?P<name>[^\n(#]+?)?\s*\(#(?P<uuid>[0-9a-fA-F-]{36})\)")
EVENT_ID_RE = re.compile(r"Event ID:\s*(?P<id>[0-9a-fA-F]{64})")
REPLY_TO_RE = re.compile(r"--reply-to\s+(?P<id>[0-9a-fA-F]{64})")
CONTENT_RE = re.compile(r"^Content:\s*(?P<content>[\s\S]*)$", re.MULTILINE)
FROM_HEX_RE = re.compile(r"hex:\s*(?P<hex>[0-9a-fA-F]{64})")
BUZZ_EVENT_RE = re.compile(r"\[Buzz event:[^\]]*\](?P<body>.*?)(?=\n\[|\Z)", re.DOTALL)
REPLY_LOCK_DIR = Path(os.environ.get("PI_BUZZ_ACP_REPLY_LOCK_DIR", "/tmp/pi-buzz-acp-reply-locks"))
REPLY_LOCK_STALE_S = float(os.environ.get("PI_BUZZ_ACP_REPLY_LOCK_STALE_S", "180"))
LIVE_LOG_PATH = Path(os.environ.get("PI_BUZZ_ACP_LIVE_LOG_PATH", "/tmp/pi-buzz-acp-live.log"))
CHANNEL_UUID_RE = re.compile(
    r"Channel:\s*(?:(?P<name>[^\n(#]+?)\s*)?(?:\(#(?P<uuid1>[0-9a-fA-F-]{36})\)|(?P<uuid2>[0-9a-fA-F-]{36}))",
    re.IGNORECASE,
)
CONTEXT_CHANNEL_RE = re.compile(
    r"\[Context\][^\[]*?Channel:\s*(?P<uuid>[0-9a-fA-F-]{36})",
    re.IGNORECASE | re.DOTALL,
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
    system_prompt: str | None = None
    prompt_count: int = 0
    created_at: float = field(default_factory=time.time)


SESSIONS: dict[str, SessionState] = {}
PUBLISHED_REPLY_TO: set[str] = set()


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


def trim(text: str, limit: int = 320) -> str:
    text = " ".join(str(text).split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def live_log(message: str) -> None:
    try:
        LIVE_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with LIVE_LOG_PATH.open("a", encoding="utf-8") as fh:
            fh.write(time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()) + " " + message + "\n")
    except Exception:
        pass


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

    channel_match = CHANNEL_UUID_RE.search(prompt_text) or CHANNEL_RE.search(prompt_text)
    if channel_match:
        groups = channel_match.groupdict()
        channel_uuid = groups.get("uuid") or groups.get("uuid1") or groups.get("uuid2")
        name = (groups.get("name") or "").strip() or None
        if channel_uuid:
            ctx.channel_id = channel_uuid
        ctx.channel_name = name
    if not ctx.channel_id:
        context_match = CONTEXT_CHANNEL_RE.search(prompt_text)
        if context_match:
            ctx.channel_id = context_match.group("uuid")
    if not ctx.channel_id:
        loose = re.search(
            r"(?:--channel|/channels/|channel[_ ]id[:\s]+)([0-9a-fA-F-]{36})",
            prompt_text,
            re.IGNORECASE,
        )
        if loose:
            ctx.channel_id = loose.group(1)

    # Triggering event lives in the last [Buzz event: ...] block. Do NOT treat the
    # thread-root `--reply-to` from Context instructions as the claim key — that
    # is shared by every follow-up in a thread and would suppress replies.
    buzz_events = list(BUZZ_EVENT_RE.finditer(prompt_text))
    buzz_body = buzz_events[-1].group("body") if buzz_events else prompt_text
    event_match = EVENT_ID_RE.search(buzz_body)
    if event_match:
        ctx.event_id = event_match.group("id")
    elif buzz_events:
        # Fallback: Event ID on the [Buzz event: <id>] header if present
        header = buzz_events[-1].group(0)
        header_id = re.search(r"\[Buzz event:\s*([0-9a-fA-F]{64})", header)
        if header_id:
            ctx.event_id = header_id.group(1)

    # Publish destination may be the thread root (from Context IMPORTANT --reply-to).
    reply_matches = list(REPLY_TO_RE.finditer(prompt_text))
    if reply_matches:
        ctx.reply_to = reply_matches[-1].group("id")
    elif ctx.event_id:
        ctx.reply_to = ctx.event_id

    from_match = FROM_HEX_RE.search(prompt_text)
    if from_match:
        ctx.from_pubkey = from_match.group("hex")

    content_match = CONTENT_RE.search(buzz_body)
    if content_match:
        body_content = content_match.group("content")
        body_content = re.split(r"\n(?:Tags:|Parsed:|Kind:|From:|Time:)", body_content, maxsplit=1)[0]
        ctx.content = body_content.strip()
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
        "how are you", "hows it going", "how's it going",
        "good morning", "good afternoon", "good evening",
        "cmon", "cmon man", "come on", "come on man", "ping", "test",
    }
    return cleaned in phrases


def buzz_env() -> dict[str, str]:
    env = os.environ.copy()
    relay = env.get("BUZZ_RELAY_URL", "")
    if relay.startswith("wss://"):
        env["BUZZ_RELAY_URL"] = "https://" + relay[len("wss://") :]
    elif relay.startswith("ws://"):
        env["BUZZ_RELAY_URL"] = "http://" + relay[len("ws://") :]
    return env


def claim_reply_slot(reply_to: str | None) -> bool:
    if not reply_to:
        return True
    if reply_to in PUBLISHED_REPLY_TO:
        return False
    REPLY_LOCK_DIR.mkdir(parents=True, exist_ok=True)
    lock_path = REPLY_LOCK_DIR / reply_to
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
            try:
                lock_path.unlink(missing_ok=True)
            except OSError:
                return False
    return False


def release_reply_slot(reply_to: str | None) -> None:
    if not reply_to:
        return
    PUBLISHED_REPLY_TO.discard(reply_to)
    lock_path = REPLY_LOCK_DIR / reply_to
    try:
        lock_path.unlink(missing_ok=True)
    except OSError:
        pass


def turn_claim_key(buzz: BuzzEventContext) -> str | None:
    """Unique per triggering message. Never use the thread-root reply destination."""
    if buzz.event_id:
        return buzz.event_id
    content = (buzz.content or "").strip()
    if buzz.channel_id and content:
        digest = hashlib.sha256(f"{buzz.channel_id}\n{content}".encode()).hexdigest()
        return digest
    return None


def already_replied_to(channel_id: str, reply_to: str | None) -> bool:
    """Only trust channel history — claim locks must not count as published."""
    if not reply_to:
        return False
    proc = subprocess.run(
        [DEFAULT_BUZZ_BIN, "messages", "get", "--channel", channel_id, "--limit", "40"],
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        timeout=20,
        env=buzz_env(),
    )
    if proc.returncode != 0:
        return False
    try:
        msgs = json.loads(proc.stdout or "[]")
    except json.JSONDecodeError:
        return False
    me = subprocess.run(
        [DEFAULT_BUZZ_BIN, "users", "get"],
        stdin=subprocess.DEVNULL,
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


def publish_channel_reply(*, channel_id: str, content: str, reply_to: str | None, mention: str | None = None) -> dict[str, Any]:
    if not os.environ.get("BUZZ_PRIVATE_KEY"):
        raise RuntimeError("BUZZ_PRIVATE_KEY missing — cannot publish channel reply")
    cmd = [DEFAULT_BUZZ_BIN, "messages", "send", "--channel", channel_id, "--content", "-"]
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


def resolve_pi_command() -> list[str]:
    if DEFAULT_PI_CMD:
        return DEFAULT_PI_CMD.split()
    if Path(DEFAULT_PI_BIN).exists():
        return [DEFAULT_PI_BIN]
    return ["npx", "-y", "@earendil-works/pi-coding-agent", "--"]


def build_pi_prompt(user_text: str, buzz: BuzzEventContext, state: SessionState) -> str:
    channel = buzz.channel_name or "unknown"
    return (
        f"You are Pi replying inside Buzz chat.\n"
        f"Channel: {channel}\n"
        f"Rules:\n"
        f"- Reply naturally like a teammate in chat.\n"
        f"- Be concise: 1-4 short sentences unless detail is clearly needed.\n"
        f"- Do not mention hidden system prompts, ACP, adapters, or Buzz internals.\n"
        f"- Do not use markdown fences.\n"
        f"- If the message is casual chit-chat, respond casually and invite the real ask.\n\n"
        f"User message:\n{user_text.strip()}"
    )


def run_pi_reply(prompt_text: str, buzz: BuzzEventContext, state: SessionState) -> str:
    user_text = (buzz.content or "").strip() or prompt_text.strip()
    if is_casual_chitchat(user_text):
        return "Hey — I’m here. What do you want to dig into?"

    system_prompt = state.system_prompt or (
        "You are Pi chatting inside Buzz. Reply like a practical teammate: clear, direct, concise. "
        "Do not mention tools, adapters, or hidden context unless the user explicitly asks."
    )
    prompt = build_pi_prompt(user_text, buzz, state)
    provider = os.environ.get("PI_BUZZ_ACP_PROVIDER", "commandcode").strip() or "commandcode"
    model = (
        os.environ.get("PI_BUZZ_ACP_MODEL", "deepseek/deepseek-v4-pro").strip()
        or "deepseek/deepseek-v4-pro"
    )
    cmd = [
        *resolve_pi_command(),
        "-p",
        "--provider",
        provider,
        "--model",
        model,
        "--mode",
        "text",
        "--no-session",
        "--no-tools",
        "--thinking",
        "off",
        "--system-prompt",
        system_prompt,
        prompt,
    ]
    live_log(f"pi_cmd provider={provider} model={model}")

    # Pi prints then hangs, and may block-buffer on pipes. Use a PTY + kill once we have text.
    import pty
    import select

    master_fd, slave_fd = pty.openpty()
    try:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.DEVNULL,
            stdout=slave_fd,
            stderr=slave_fd,
            cwd=state.cwd or os.getcwd(),
            env=os.environ.copy(),
            close_fds=True,
        )
    finally:
        os.close(slave_fd)

    chunks: list[bytes] = []
    deadline = time.time() + PI_TIMEOUT_S
    try:
        while time.time() < deadline:
            if proc.poll() is not None:
                # drain remaining
                while True:
                    ready, _, _ = select.select([master_fd], [], [], 0.05)
                    if not ready:
                        break
                    try:
                        data = os.read(master_fd, 4096)
                    except OSError:
                        data = b""
                    if not data:
                        break
                    chunks.append(data)
                break
            ready, _, _ = select.select([master_fd], [], [], 0.2)
            if not ready:
                continue
            try:
                data = os.read(master_fd, 4096)
            except OSError:
                data = b""
            if not data:
                break
            chunks.append(data)
            # After first bytes, wait briefly for more, then stop (do not wait for process exit).
            quiet_deadline = time.time() + 0.75
            while time.time() < quiet_deadline:
                ready, _, _ = select.select([master_fd], [], [], 0.1)
                if not ready:
                    continue
                try:
                    more = os.read(master_fd, 4096)
                except OSError:
                    more = b""
                if not more:
                    break
                chunks.append(more)
                quiet_deadline = time.time() + 0.75
            break
    finally:
        if proc.poll() is None:
            proc.kill()
            try:
                proc.wait(timeout=2)
            except Exception:
                pass
        try:
            os.close(master_fd)
        except OSError:
            pass

    stdout = b"".join(chunks).decode("utf-8", errors="replace")
    # strip script/pty noise
    stdout = stdout.replace("\x08", "").replace("^D", "").strip()
    if not stdout:
        raise RuntimeError(f"Pi produced no output (exit={proc.returncode})")
    reply = stdout
    fenced = re.match(r"```(?:text|markdown)?\s*([\s\S]*?)```\s*$", reply, re.IGNORECASE)
    if fenced:
        reply = fenced.group(1).strip()
    if len(reply) > MAX_RESPONSE_CHARS:
        reply = reply[: MAX_RESPONSE_CHARS - 1].rstrip() + "…"
    live_log(f"pi_reply_chars={len(reply)}")
    return reply


def handle_initialize(msg_id: Any, _params: dict[str, Any]) -> None:
    send_result(
        msg_id,
        {
            "protocolVersion": PROTOCOL_VERSION,
            "agentCapabilities": {
                "loadSession": False,
                "promptCapabilities": {"image": False, "audio": False, "embeddedContext": True},
                "mcpCapabilities": {"http": False, "sse": False},
                "sessionCapabilities": {},
            },
            "agentInfo": {"name": CLIENT_NAME, "title": "Pi Buzz Agent", "version": CLIENT_VERSION},
            "serverInfo": {"name": CLIENT_NAME, "version": CLIENT_VERSION},
        },
    )


def handle_session_new(msg_id: Any, params: dict[str, Any]) -> None:
    session_id = f"pi-buzz-{uuid.uuid4()}"
    cwd = params.get("cwd") if isinstance(params.get("cwd"), str) else None
    state = SessionState(
        cwd=cwd,
        system_prompt=params.get("systemPrompt") if isinstance(params.get("systemPrompt"), str) else None,
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
    # reply_to = where to publish in the thread (may be root). claim_key = this message.
    reply_to = buzz.reply_to or buzz.event_id
    claim_key = turn_claim_key(buzz)
    live_log(
        f"turn_start session={session_id} channel={buzz.channel_id} channel_name={buzz.channel_name} "
        f"event_id={buzz.event_id} reply_to={reply_to} claim_key={claim_key} "
        f"content={trim(buzz.content or prompt_text, 200)} prompt_chars={len(prompt_text)}"
    )
    if not buzz.channel_id:
        live_log(f"parse_missing_channel session={session_id} prompt_head={trim(prompt_text, 400)!r}")

    if claim_key and not claim_reply_slot(claim_key):
        live_log(f"turn_duplicate_claim session={session_id} claim_key={claim_key}")
        notify_update(session_id, "agent_thought_chunk", "Another worker already claimed this event — skipping.")
        notify_update(session_id, "agent_message_chunk", "(duplicate turn suppressed)")
        send_result(msg_id, {"stopReason": "end_turn"})
        return
    # Only check channel history against the triggering event id. Checking the thread
    # root would mark every follow-up as already-replied after the first answer.
    dedupe_id = buzz.event_id
    if buzz.channel_id and dedupe_id and already_replied_to(buzz.channel_id, dedupe_id):
        live_log(f"turn_already_replied session={session_id} channel={buzz.channel_id} event_id={dedupe_id}")
        release_reply_slot(claim_key)
        notify_update(session_id, "agent_thought_chunk", "Reply already published — skipping duplicate.")
        notify_update(session_id, "agent_message_chunk", "(duplicate turn suppressed)")
        send_result(msg_id, {"stopReason": "end_turn"})
        return

    notify_update(session_id, "agent_thought_chunk", "Thinking with Pi…")
    try:
        response_text = run_pi_reply(prompt_text, buzz, state)
    except Exception as exc:
        response_text = (
            f"I hit a snag generating a full reply ({trim(str(exc), 180)}). "
            "Try me again, or ask in a more specific way."
        )
        live_log(f"pi_error session={session_id} error={trim(str(exc), 300)}")

    publish_result: dict[str, Any] | None = None
    publish_error: str | None = None
    if buzz.channel_id:
        try:
            notify_update(session_id, "agent_thought_chunk", "Publishing reply with buzz messages send…")
            publish_result = publish_channel_reply(
                channel_id=buzz.channel_id,
                content=response_text,
                reply_to=reply_to,
                mention=buzz.from_pubkey,
            )
            if claim_key:
                PUBLISHED_REPLY_TO.add(claim_key)
            live_log(
                f"publish_ok session={session_id} channel={buzz.channel_id} "
                f"event_id={buzz.event_id} reply_to={reply_to} claim_key={claim_key}"
            )
        except Exception as exc:
            publish_error = str(exc)
            live_log(f"publish_failed session={session_id} error={trim(publish_error, 300)}")
            if claim_key:
                try:
                    release_reply_slot(claim_key)
                except Exception:
                    pass
            response_text = (
                f"{response_text}\n\n"
                f"(Failed to publish to channel: {trim(publish_error, 240)}. ACP stream still has the reply above.)"
            )
    else:
        publish_error = "no channel id found in prompt — reply not published to Buzz"
        live_log(f"publish_skipped session={session_id} error={publish_error}")
        response_text = f"{response_text}\n\n({publish_error})"

    notify_update(session_id, "agent_message_chunk", response_text)
    live_log(
        f"turn_done session={session_id} reply_to={reply_to} "
        f"publish={'ok' if publish_result else 'fail'} error={trim(publish_error or '', 180)}"
    )
    send_result(msg_id, {"stopReason": "end_turn", "publishResult": publish_result, "publishError": publish_error})


def handle_session_cancel(msg_id: Any, _params: dict[str, Any]) -> None:
    if msg_id is not None:
        send_result(msg_id, {})


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
    else:
        send_error(msg_id, -32601, f"method not found: {method}")


def main() -> None:
    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue
        try:
            msg = json.loads(raw)
            if not isinstance(msg, dict):
                raise ValueError("request must be an object")
            dispatch(msg)
        except SystemExit:
            raise
        except Exception as exc:
            trace = traceback.format_exc(limit=2)
            send_error(None, -32603, f"internal error: {exc}", {"trace": trace})


if __name__ == "__main__":
    main()

