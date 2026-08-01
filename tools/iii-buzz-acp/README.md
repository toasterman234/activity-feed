# iii Buzz ACP bridge

This is a local ACP bridge for the Buzz desktop app.

## What it is

- Speaks the ACP stdio protocol Buzz expects.
- Calls the local `iii` CLI underneath.
- Creates and reuses an iii-backed session per Buzz ACP session.
- Records prompt/response activity into agentmemory.
- Uses iii session + memory functions now:
  - `api::session::start`
  - `api::context`
  - `api::summarize`
  - `api::session::end`
  - `mem::observe`
  - `mem::search`
  - `mem::next`

## Why this shape

- **Works with Buzz today** because Buzz custom harnesses require ACP over stdio.
- **More long-term than a fake one-off shell shim** because the ACP layer is explicit and reusable.
- Lets us swap the backend later without changing Buzz again.

## Current behavior (v0.4)

This bridge now behaves like a real Buzz agent for channel mentions:

- Parses Buzz prompt context (channel id, event id, user content)
- Drafts a reply from iii memory / session context for normal chat
- In `#experiments` or experiment-like chats, switches into a guided local experiment workflow
- **Publishes the reply with `buzz messages send`** (threaded via `--reply-to` when present)
- Still emits ACP `agent_message_chunk` for harness logs/observers

### Experiment workflow now wired in

Inside Buzz chat, the bridge can drive the local tracker without terminal commands:

1. guided idea capture
2. discovery notes
3. intake review
4. create experiment after explicit confirmation
5. later experiment updates

It calls the local tracker script underneath:

- `capture`
- `discover`
- `intake`
- `create`
- `update`

Default tracker path:

```text
~/activity-feed/tools/experiment-tracker/experiment_tracker.py
```

Override with:

- `III_ACP_TRACKER_ROOT`
- `III_ACP_TRACKER_SCRIPT`

Live debug log:

```text
/tmp/iii-buzz-acp-live.log
```

Override with `III_ACP_LIVE_LOG_PATH`.

It is still not a full iii native chat/runtime engine (no true iii model-turn API).
Requires `BUZZ_PRIVATE_KEY` / `BUZZ_RELAY_URL` / `BUZZ_AUTH_TAG` in the agent environment (buzz-acp provides these).

## Manual test

```bash
python3 tools/iii-buzz-acp/iii_buzz_acp.py <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":2}}
{"jsonrpc":"2.0","id":2,"method":"session/new","params":{"cwd":"/Users/bencharney/activity-feed","mcpServers":[]}}
{"jsonrpc":"2.0","id":3,"method":"session/prompt","params":{"sessionId":"replace-me","prompt":[{"type":"text","text":"What do you know about Buzz ACP integration?"}]}}
EOF
```

For a full test, use the scripted harness test below instead of hand-editing the session id.

## Scripted test

```bash
python3 - <<'PY'
import json, subprocess
p = subprocess.Popen(
    ["python3", "tools/iii-buzz-acp/iii_buzz_acp.py"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    text=True,
)

def ask(obj):
    p.stdin.write(json.dumps(obj) + "\n")
    p.stdin.flush()
    return json.loads(p.stdout.readline())

print(ask({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":2}}))
sess = ask({"jsonrpc":"2.0","id":2,"method":"session/new","params":{"cwd":"/Users/bencharney/activity-feed","mcpServers":[]}})
print(sess)
while True:
    p.stdin.write(json.dumps({
        "jsonrpc":"2.0",
        "id":3,
        "method":"session/prompt",
        "params":{
            "sessionId":sess["result"]["sessionId"],
            "prompt":[{"type":"text","text":"What do you know about Buzz ACP integration?"}]
        }
    }) + "\n")
    p.stdin.flush()
    line = json.loads(p.stdout.readline())
    print(line)
    if line.get("id") == 3:
        break
PY
```

## Live Buzz app check

I verified the ACP bridge itself and the Buzz custom harness file location.
I did **not** verify the runtime picker inside the live Buzz desktop UI from this script alone.
If the Buzz app bundle is missing or not launchable locally, the file can still be correct even though UI confirmation is pending.

## Buzz custom harness file

Buzz loads custom harness JSON files from:

```text
~/Library/Application Support/xyz.block.buzz.app/custom_harnesses/
```

The matching runtime definition for this bridge is written as:

```text
~/Library/Application Support/xyz.block.buzz.app/custom_harnesses/iii_bridge.json
```

## Rollback

1. Delete the custom harness file from Buzz app data.
2. Delete this folder if you no longer want the bridge.
3. Restart Buzz.
