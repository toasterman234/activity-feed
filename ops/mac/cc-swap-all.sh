#!/bin/sh
# ONE command to point every Command Code consumer at the same subscription key.
# Updates:
#   1. Pi              -> ~/.pi/agent/auth.json          (direct to api.commandcode.ai)
#   2. Proxy           -> ~/.openclaw/service-env/ai.openclaw.ccproxy.env  (ax / Mira / crew), then restarts it
#   3. Terminal CLI    -> ~/.commandcode/auth.json        (so the CLI matches too)
#   4. ax-control-plane-> /private/tmp/ax-control-plane-inspect/ax-control-plane/.env, then restarts it
#
# Usage:
#   cc-swap-all.sh <new-key>   # paste the key (best for phone / Termius)
#   cc-swap-all.sh             # interactive prompt (key not echoed, not in history)
#
# After running, start a FRESH pi/Paseo session so it re-reads auth.json.
# Also fans out to OVH over SSH unless CC_SWAP_SKIP_REMOTE=1.
set -eu

PI_AUTH="$HOME/.pi/agent/auth.json"
CC_AUTH="$HOME/.commandcode/auth.json"
ENV_FILE="$HOME/.openclaw/service-env/ai.openclaw.ccproxy.env"
LABEL="ai.openclaw.ccproxy"

if [ $# -ge 1 ]; then
  KEY="$1"
else
  if [ -r /dev/tty ] && [ -w /dev/tty ]; then
    printf 'Paste new Command Code API key: ' > /dev/tty
    old_tty="$(stty -g < /dev/tty 2>/dev/null || true)"
    stty -echo < /dev/tty 2>/dev/null || true
    IFS= read -r KEY < /dev/tty || KEY=""
    [ -n "$old_tty" ] && stty "$old_tty" < /dev/tty 2>/dev/null || true
    printf '\n' > /dev/tty
  elif [ -t 0 ]; then
    printf 'Paste new Command Code API key: '
    old_tty="$(stty -g 2>/dev/null || true)"
    stty -echo 2>/dev/null || true
    IFS= read -r KEY || KEY=""
    [ -n "$old_tty" ] && stty "$old_tty" 2>/dev/null || true
    echo
  else
    echo "No key given and no interactive TTY available. Pass the key as an argument." >&2
    exit 1
  fi
fi
[ -n "${KEY:-}" ] || { echo "No key given, aborting." >&2; exit 1; }
suffix="$(printf '%s' "$KEY" | tail -c 6)"
case "$KEY" in
  user_*) ;;
  *)
    echo "Key does not look like a Command Code API key (expected prefix user_). Aborting." >&2
    exit 1
    ;;
esac

# Optional sanity check: is the key valid? (200 = ok; skip silently if curl unavailable)
if command -v curl >/dev/null 2>&1; then
  code=$(curl -s -o /dev/null -w "%{http_code}" https://api.commandcode.ai/provider/v1/models \
           -H "Authorization: Bearer $KEY" 2>/dev/null || echo "000")
  if [ "$code" = "401" ]; then
    echo "Key rejected by Command Code (HTTP 401). Aborting, nothing changed." >&2
    exit 1
  fi
  echo "Key auth check: HTTP $code (200 = valid; 403 on /provider is fine for Go plans)"
fi

KEY="$KEY" PI="$PI_AUTH" CC="$CC_AUTH" python3 <<'PY'
import json, os, shutil
from pathlib import Path

key = os.environ["KEY"].strip()
changed = []

# 1. Pi auth.json
pi = Path(os.environ["PI"])
if pi.exists():
    d = json.loads(pi.read_text())
    old = d.get("commandcode", {}).get("access", "")
    if old != key:
        shutil.copy(pi, pi.with_suffix(".json.bak-ccswap"))
        cc = d.setdefault("commandcode", {})
        cc.update({"type": "oauth", "access": key, "refresh": key, "expires": 2099431038159})
        t = pi.with_suffix(".json.tmp"); t.write_text(json.dumps(d, indent=2) + "\n")
        os.chmod(t, 0o600); t.replace(pi)
        changed.append("pi")
    else:
        print("pi: already current")

# 2. Terminal CLI auth.json
cc_path = Path(os.environ["CC"])
if cc_path.exists():
    d = json.loads(cc_path.read_text())
    if d.get("apiKey", "") != key:
        shutil.copy(cc_path, cc_path.with_suffix(".json.bak-ccswap"))
        d["apiKey"] = key
        t = cc_path.with_suffix(".json.tmp"); t.write_text(json.dumps(d, indent=2) + "\n")
        os.chmod(t, 0o600); t.replace(cc_path)
        changed.append("cli")
    else:
        print("cli: already current")

print("PY_CHANGED=" + ",".join(changed))
PY

# 3. Proxy env file (sed the CC_API_KEY line) + restart
if [ -f "$ENV_FILE" ]; then
  if grep -q "CC_API_KEY='$KEY'" "$ENV_FILE"; then
    echo "proxy: already current"
  else
    cp "$ENV_FILE" "$ENV_FILE.bak"
    awk -v k="$KEY" '/^export CC_API_KEY=/ { print "export CC_API_KEY='\''" k "'\''"; next } { print }' \
      "$ENV_FILE.bak" > "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    launchctl kickstart -k "gui/$(id -u)/$LABEL" && echo "proxy: updated + restarted"
  fi
fi

# 4. ax-control-plane .env (PROXY_API_KEY) + restart backend + web
AC_PLANE_ENV="/private/tmp/ax-control-plane-inspect/ax-control-plane/.env"
AC_PLANE_DIR="/private/tmp/ax-control-plane-inspect/ax-control-plane"
AC_PLANE_WEB_DIR="$AC_PLANE_DIR/web"

if [ -f "$AC_PLANE_ENV" ]; then
  if grep -q "PROXY_API_KEY=$KEY" "$AC_PLANE_ENV"; then
    echo "ax-control-plane: already current"
  else
    cp "$AC_PLANE_ENV" "$AC_PLANE_ENV.bak"
    awk -v k="$KEY" '/^PROXY_API_KEY=/ { print "PROXY_API_KEY=" k; next } { print }' \
      "$AC_PLANE_ENV.bak" > "$AC_PLANE_ENV"
    chmod 600 "$AC_PLANE_ENV"

    # Kill running processes (match by path, not PID)
    pkill -f "tsx.*src/index.ts.*ax-control-plane" 2>/dev/null || true
    pkill -f "next dev -p 3021" 2>/dev/null || true
    sleep 1

    # Restart backend (pnpm, since deps are pnpm-managed)
    cd "$AC_PLANE_DIR"
    nohup pnpm run start > /tmp/ax-control-plane-restart.log 2>&1 &

    # Restart web dashboard
    if [ -d "$AC_PLANE_WEB_DIR" ]; then
      cd "$AC_PLANE_WEB_DIR"
      nohup npx next dev -p 3021 > /tmp/ax-control-plane-web.log 2>&1 &
    fi

    echo "ax-control-plane: updated + restarted"
  fi
else
  echo "ax-control-plane: skipped (no .env at $AC_PLANE_ENV)"
fi

# 5. Buzz agent(s) — any managed agent with runtime buzz-agent using the CC proxy.
BUZZ_AGENTS_JSON="$HOME/Library/Application Support/xyz.block.buzz.app/agents/managed-agents.json"
if [ -f "$BUZZ_AGENTS_JSON" ]; then
  KEY="$KEY" FILE="$BUZZ_AGENTS_JSON" python3 <<'PY'
import json, os
key = os.environ["KEY"].strip()
path = os.environ["FILE"]
with open(path) as f:
    agents = json.load(f)
updated = 0
for a in agents:
    if a.get("runtime") != "buzz-agent":
        continue
    ev = a.setdefault("env_vars", {})
    old = ev.get("OPENAI_COMPAT_API_KEY", "")
    if old == key:
        continue
    ev["OPENAI_COMPAT_API_KEY"] = key
    a["env_vars"] = ev
    old_s = old[-6:] if old else "none"
    new_s = key[-6:]
    print(f"buzz-agent '{a.get('display_name','?')}': updated (...{old_s} -> ...{new_s})")
    updated += 1
if updated:
    t = path + ".tmp"
    with open(t, "w") as f:
        json.dump(agents, f, indent=2)
    os.replace(t, path)
    print(f"buzz-agent: {updated} agent(s) updated")
else:
    print("buzz-agent: already current")
PY
else
  echo "buzz-agent: skipped (no managed-agents.json at $BUZZ_AGENTS_JSON)"
fi

# 6. Fan-out to OVH (activity dashboard / iii / OVH pi).
if [ "${CC_SWAP_SKIP_REMOTE:-0}" = "1" ]; then
  echo "remote-ovh: skipped (CC_SWAP_SKIP_REMOTE=1)"
else
  REMOTE_OVH="${CC_SWAP_REMOTE_OVH:-ovhvps}"
  if command -v ssh >/dev/null 2>&1; then
    if ssh -o BatchMode=yes -o ConnectTimeout=8 "$REMOTE_OVH"       "CC_SWAP_SKIP_REMOTE=1 \"\$HOME/.openclaw/service-env/cc-swap-all.sh\" '$KEY'"; then
      echo "remote-ovh: swapped (...$suffix)"
    else
      echo "remote-ovh: FAILED (local consumers still updated — fix SSH to $REMOTE_OVH)" >&2
    fi
  else
    echo "remote-ovh: skipped (no ssh)"
  fi
fi

echo "All set (key ...$suffix). Start a fresh pi/Paseo session to pick it up."
