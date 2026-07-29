#!/bin/sh
# OVH/Linux variant of cc-swap-all.sh for the activity dashboard Swap page.
# Updates Command Code consumers that exist on this host:
#   1. Pi              -> ~/.pi/agent/auth.json
#   2. Terminal CLI    -> ~/.commandcode/auth.json
#   3. iii harness     -> llm-router providers.commandcode.api_key
#                        (and providers.openai.api_key when it still holds a CC key)
# Optionally (if present):
#   4. Proxy env       -> ~/.openclaw/service-env/ai.openclaw.ccproxy.env (+ systemd restart if unit exists)
#
# Mac-only paths (launchctl / ax-control-plane under /private/tmp) are skipped locally;
# after local updates, fans out to the Mac Mini over SSH unless CC_SWAP_SKIP_REMOTE=1.
#
# Usage:
#   cc-swap-all.sh <new-key>
set -eu

PI_AUTH="$HOME/.pi/agent/auth.json"
CC_AUTH="$HOME/.commandcode/auth.json"
ENV_FILE="$HOME/.openclaw/service-env/ai.openclaw.ccproxy.env"
III_BIN="${III_BIN:-$HOME/.local/bin/iii}"
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

if [ $# -ge 1 ]; then
  KEY="$1"
else
  echo "No key given. Pass the key as an argument." >&2
  exit 1
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

pi = Path(os.environ["PI"])
if pi.exists():
    d = json.loads(pi.read_text())
    old = d.get("commandcode", {}).get("access", "")
    if old != key:
        shutil.copy(pi, pi.with_suffix(".json.bak-ccswap"))
        cc = d.setdefault("commandcode", {})
        cc.update({"type": "oauth", "access": key, "refresh": key, "expires": 2099431038159})
        t = pi.with_suffix(".json.tmp")
        t.write_text(json.dumps(d, indent=2) + "\n")
        os.chmod(t, 0o600)
        t.replace(pi)
        changed.append("pi")
        old_s = old[-6:] if old else "none"
        print(f"pi: updated (...{old_s} -> ...{key[-6:]})")
    else:
        print("pi: already current")
else:
    print(f"pi: skipped (missing {pi})")

cc_path = Path(os.environ["CC"])
if cc_path.exists():
    d = json.loads(cc_path.read_text())
    if d.get("apiKey", "") != key:
        shutil.copy(cc_path, cc_path.with_suffix(".json.bak-ccswap"))
        d["apiKey"] = key
        t = cc_path.with_suffix(".json.tmp")
        t.write_text(json.dumps(d, indent=2) + "\n")
        os.chmod(t, 0o600)
        t.replace(cc_path)
        changed.append("cli")
        print(f"cli: updated (...{key[-6:]})")
    else:
        print("cli: already current")
else:
    print(f"cli: skipped (missing {cc_path})")

print("PY_CHANGED=" + ",".join(changed))
PY

# 3. iii harness llm-router credentials (CommandCode DeepSeek via Mac proxy)
if [ -x "$III_BIN" ] || command -v iii >/dev/null 2>&1; then
  KEY="$KEY" III_BIN="${III_BIN:-iii}" python3 <<'PY'
import json, os, subprocess, sys, tempfile

key = os.environ["KEY"].strip()
iii = os.environ.get("III_BIN") or "iii"
if not os.path.isabs(iii):
    from shutil import which
    found = which(iii)
    if not found:
        print("iii: skipped (iii binary not found)")
        sys.exit(0)
    iii = found

def run(args, timeout=20):
    return subprocess.check_output(args, text=True, timeout=timeout)

try:
    raw = run([
        iii, "trigger", "configuration::get",
        "--json", json.dumps({"id": "llm-router", "raw": True}),
        "--timeout-ms", "15000",
    ], timeout=25)
except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError) as e:
    print(f"iii: skipped (engine unreachable: {e})", file=sys.stderr)
    sys.exit(0)

try:
    obj = json.loads(raw)
except json.JSONDecodeError as e:
    print(f"iii: failed to parse configuration::get: {e}", file=sys.stderr)
    sys.exit(1)

value = obj.get("value") if isinstance(obj, dict) and "value" in obj else obj
if not isinstance(value, dict):
    print("iii: unexpected llm-router shape", file=sys.stderr)
    sys.exit(1)

providers = value.setdefault("providers", {})
if not isinstance(providers, dict):
    print("iii: providers missing/invalid", file=sys.stderr)
    sys.exit(1)

changed = []
for name in ("commandcode", "openai"):
    entry = providers.get(name)
    if not isinstance(entry, dict):
        if name == "commandcode":
            entry = {}
            providers[name] = entry
        else:
            continue
    old = entry.get("api_key") or ""
    # Only overwrite openai when it already holds a Command Code key (or empty
    # seed path). Avoid clobbering a real OpenAI key if one is ever installed.
    if name == "openai" and old and not str(old).startswith("user_"):
        continue
    if old == key:
        print(f"iii.{name}: already current")
        continue
    entry["api_key"] = key
    if name == "commandcode" and not entry.get("api_url"):
        entry["api_url"] = "http://100.71.118.10:18787/v1/chat/completions"
    if name == "commandcode" and not entry.get("max_tokens"):
        entry["max_tokens"] = 8192
    providers[name] = entry
    old_s = str(old)[-6:] if old else "none"
    print(f"iii.{name}: updated (...{old_s} -> ...{key[-6:]})")
    changed.append(name)

if not changed:
    print("iii: already current")
    sys.exit(0)

payload = {"id": "llm-router", "value": value}
with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
    json.dump(payload, f)
    path = f.name
try:
    run([
        iii, "trigger", "configuration::set",
        "--json", open(path).read(),
        "--timeout-ms", "20000",
    ], timeout=30)
finally:
    try:
        os.unlink(path)
    except OSError:
        pass

print("iii: llm-router updated (" + ",".join(changed) + ")")
PY
else
  echo "iii: skipped (no iii binary)"
fi

if [ -f "$ENV_FILE" ]; then
  if grep -q "CC_API_KEY='$KEY'" "$ENV_FILE"; then
    echo "proxy: already current"
  else
    cp "$ENV_FILE" "$ENV_FILE.bak"
    awk -v k="$KEY" '/^export CC_API_KEY=/ { print "export CC_API_KEY='\''" k "'\''"; next } { print }' \
      "$ENV_FILE.bak" > "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    if command -v systemctl >/dev/null 2>&1 && systemctl --user list-unit-files 2>/dev/null | grep -q "ai.openclaw.ccproxy"; then
      systemctl --user restart ai.openclaw.ccproxy.service && echo "proxy: updated + restarted (systemd --user)"
    elif command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q "ai.openclaw.ccproxy"; then
      systemctl restart ai.openclaw.ccproxy.service && echo "proxy: updated + restarted (systemd)"
    else
      echo "proxy: env updated (no ccproxy unit found to restart)"
    fi
  fi
else
  echo "proxy: skipped (no env at $ENV_FILE — expected on Mac Mini, not OVH)"
fi

# 5. Fan-out to Mac Mini (paseo/pi + ccproxy live there).
# Guard against Mac↔OVH recursion when the peer script fans back.
if [ "${CC_SWAP_SKIP_REMOTE:-0}" = "1" ]; then
  echo "remote-mac: skipped (CC_SWAP_SKIP_REMOTE=1)"
else
  REMOTE_MAC="${CC_SWAP_REMOTE_MAC:-bencharney@100.71.118.10}"
  if command -v ssh >/dev/null 2>&1; then
    if ssh -o BatchMode=yes -o ConnectTimeout=8 "$REMOTE_MAC"       "CC_SWAP_SKIP_REMOTE=1 \"\$HOME/.openclaw/service-env/cc-swap-all.sh\" '$KEY'"; then
      echo "remote-mac: swapped (...$suffix)"
    else
      echo "remote-mac: FAILED (local consumers still updated — fix SSH to $REMOTE_MAC)" >&2
    fi
  else
    echo "remote-mac: skipped (no ssh)"
  fi
fi

echo "All set (key ...$suffix). Start a fresh pi/iii session to pick it up."
