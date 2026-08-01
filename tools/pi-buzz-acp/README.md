# Pi Buzz ACP bridge

Local ACP bridge for running Pi inside the Buzz desktop app.

## What it does

- Speaks ACP over stdio for Buzz
- Parses Buzz prompt context (channel, event, reply target, sender)
- Calls local `pi` for the actual reply text
- Publishes the final reply with `buzz messages send`

This is intentionally a **Buzz-aware** bridge.
It avoids relying on generic `pi-acp` for Buzz reply delivery.

## Why this exists

`pi-acp` is a good generic ACP adapter, but it does not currently wire ACP `mcpServers`
through to Pi. In Buzz, that makes reply/tool publishing unreliable.

This bridge solves only the missing Buzz-specific layer:

- take a Buzz event
- ask Pi for the reply text
- post the reply back to Buzz

## Environment

Optional:

- `PI_BUZZ_ACP_PI_CMD` — full Pi command override, split on spaces (used first)
- `PI_BUZZ_ACP_PI_BIN` — Pi binary path (default `~/.local/bin/pi`)
- `PI_BUZZ_ACP_BUZZ_BIN` — Buzz CLI path (default `~/.local/bin/buzz`)
- `PI_BUZZ_ACP_TIMEOUT_S` — Pi subprocess timeout in seconds (default `120`)
- `PI_BUZZ_ACP_PROVIDER` — optional Pi provider override
- `PI_BUZZ_ACP_MODEL` — optional Pi model override

Provided by `buzz-acp` at runtime:

- `BUZZ_PRIVATE_KEY`
- `BUZZ_RELAY_URL`
- `BUZZ_AUTH_TAG`

## Manual smoke test

```bash
python3 tools/pi-buzz-acp/pi_buzz_acp.py <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":2}}
{"jsonrpc":"2.0","id":2,"method":"session/new","params":{"cwd":"/Users/bencharney/activity-feed","mcpServers":[]}}
EOF
```

## Rollback

Point the Buzz `Pi` agent back to the old `pi_acp` runtime / custom harness.
