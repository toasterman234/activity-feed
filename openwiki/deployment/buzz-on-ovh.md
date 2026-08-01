---
type: Deployment
title: Buzz on OVH VPS
description: Self-hosted Buzz relay on the OVH VPS, exposed over Tailscale HTTPS for desktop and mobile clients.
tags: [deployment, buzz, ovh, tailscale, mobile]
---

# Buzz on OVH VPS

Buzz is now running on the OVH VPS as a separate stack from the Activity Feed dashboard.

## Canonical URLs

- Relay HTTPS base: `https://ovh-vps.taila1553c.ts.net:8450`
- Relay WebSocket URL: `wss://ovh-vps.taila1553c.ts.net:8450`
- Pairing relay WebSocket URL: `wss://ovh-vps.taila1553c.ts.net:8451`

These are **tailnet-only** URLs. A phone must have the Tailscale app installed and be connected to the same tailnet before Buzz mobile can reach them.

## Where it lives on the VPS

- Repo checkout: `/home/ubuntu/Projects/buzz-selfhost`
- Compose directory: `/home/ubuntu/Projects/buzz-selfhost/deploy/compose`
- Main env file: `/home/ubuntu/Projects/buzz-selfhost/deploy/compose/.env`
- Compose overrides added for OVH tailnet mode:
  - `compose.tailnet.reset.yml`
  - `compose.tailnet.yml`

## What is running

The VPS Buzz stack uses upstream `block/buzz` Compose assets plus a small OVH override.

### Containers

- `buzz-prod-relay-1`
- `buzz-prod-pair-relay-1`
- `buzz-prod-postgres-1`
- `buzz-prod-redis-1`
- `buzz-prod-minio-1`
- `buzz-prod-minio-init-1`

### Image pin

Pinned to the published commit image tag:

- `ghcr.io/block/buzz:sha-3e48f1b`

The semver release tag `ghcr.io/block/buzz:v0.5.2` was **not** present in GHCR during install, so the deployment uses the matching commit-style tag instead.

## Network shape

The stack is intentionally **loopback-only** on the VPS, then exposed to the tailnet with Tailscale Serve.

### Loopback listeners

- Relay container: `127.0.0.1:3001 -> container :3000`
- Pairing relay sidecar: `127.0.0.1:5001 -> container :5000`

### Tailscale Serve bindings

- `https://ovh-vps.taila1553c.ts.net:8450 -> http://127.0.0.1:3001`
- `https://ovh-vps.taila1553c.ts.net:8451 -> http://127.0.0.1:5001`

This keeps Buzz off the public NIC and matches the security posture already used elsewhere on the VPS.

## Important env choices

The OVH install uses these key settings in `.env`:

- `RELAY_URL=wss://ovh-vps.taila1553c.ts.net:8450`
- `BUZZ_PAIRING_RELAY_URL=wss://ovh-vps.taila1553c.ts.net:8451`
- `BUZZ_MEDIA_BASE_URL=https://ovh-vps.taila1553c.ts.net:8450/media`
- `BUZZ_CORS_ORIGINS=https://ovh-vps.taila1553c.ts.net:8450`
- `BUZZ_REQUIRE_AUTH_TOKEN=true`
- `BUZZ_REQUIRE_RELAY_MEMBERSHIP=true`
- `BUZZ_ALLOW_NIP_OA_AUTH=true`
- `BUZZ_AUTO_MIGRATE=true`

An initial owner pubkey was bootstrapped through `RELAY_OWNER_PUBKEY`, but the matching secret key is **not stored in this repo**.

## Pairing relay note

The upstream `buzz-pair-relay` sidecar is included in the runtime image, but it must be launched by overriding the container **entrypoint**.

Using `command` is not enough because the image already has an entrypoint for the main `buzz-relay` binary.

The working override is:

```yaml
pair-relay:
  image: ${BUZZ_IMAGE:-ghcr.io/block/buzz:main}
  entrypoint: ["/usr/local/bin/buzz-pair-relay"]
  environment:
    BUZZ_PAIR_RELAY_BIND_ADDR: 0.0.0.0:5000
  ports:
    - "127.0.0.1:5001:5000"
  restart: unless-stopped
  networks:
    - buzz-net
```

## Verification

### Health

```bash
ssh ovhvps
curl -fsS http://127.0.0.1:3001/_readiness
```

Expected:

```json
{"status":"ready"}
```

### NIP-11 relay metadata

```bash
ssh ovhvps
python3 - <<'PY'
import requests
print(requests.get(
    'https://ovh-vps.taila1553c.ts.net:8450',
    headers={'Accept': 'application/nostr+json'},
    timeout=15,
).text)
PY
```

Expected fields include:

- `software: https://github.com/block/buzz`
- `pairing_relay_url: wss://ovh-vps.taila1553c.ts.net:8451`
- `supported_nips` including `43`

### Pairing relay WebSocket

```bash
ssh ovhvps
node -e '
const ws=new WebSocket("wss://ovh-vps.taila1553c.ts.net:8451");
ws.onopen=()=>{console.log("ok"); ws.close();};
ws.onerror=e=>{console.error(e.message||e); process.exit(1)};
setTimeout(()=>process.exit(1),8000);
'
```

## Operations

### Status

```bash
ssh ovhvps
cd ~/Projects/buzz-selfhost/deploy/compose
sudo docker compose -f compose.yml -f compose.tailnet.reset.yml -f compose.tailnet.yml ps
```

### Logs

```bash
ssh ovhvps
sudo docker logs --tail 100 buzz-prod-relay-1
sudo docker logs --tail 100 buzz-prod-pair-relay-1
```

### Restart

```bash
ssh ovhvps
cd ~/Projects/buzz-selfhost/deploy/compose
sudo docker compose -f compose.yml -f compose.tailnet.reset.yml -f compose.tailnet.yml restart
```

### Recreate after editing env/overrides

```bash
ssh ovhvps
cd ~/Projects/buzz-selfhost/deploy/compose
sudo docker compose -f compose.yml -f compose.tailnet.reset.yml -f compose.tailnet.yml up -d
sudo tailscale serve --bg --https=8450 http://127.0.0.1:3001
sudo tailscale serve --bg --https=8451 http://127.0.0.1:5001
```

### Current Tailscale Serve state

```bash
ssh ovhvps
tailscale serve status
```

## Mobile / phone connection

### Requirements

1. Install Tailscale on the phone.
2. Join the same tailnet.
3. Install the Buzz mobile app build available to you.
4. Use either:
   - a Buzz pairing code / QR from a trusted desktop session, or
   - a prebuilt legacy `buzz://...` pairing code containing `relayUrl`, `pubkey`, and `nsec`.

### Why tailnet matters

Buzz mobile rejects localhost and private IP targets outside debug mode, but it accepts HTTPS/WSS hostnames. The tailnet hostname works because it is an HTTPS endpoint with a normal hostname, not a raw `100.x` address.

## Rollback

Buzz was installed in an isolated directory and does not replace the existing dashboard stack.

### Stop only Buzz

```bash
ssh ovhvps
cd ~/Projects/buzz-selfhost/deploy/compose
sudo docker compose -f compose.yml -f compose.tailnet.reset.yml -f compose.tailnet.yml down
```

### Remove the Tailscale Serve entries for Buzz

Use `tailscale serve status` to confirm the active `8450` and `8451` rules, then remove those service entries with `tailscale serve clear` for the matching service/port.

### Remove checkout later if desired

```bash
ssh ovhvps
rm -rf ~/Projects/buzz-selfhost
```

## Local desktop iii harness

The local desktop Buzz app can load a custom ACP runtime for iii from:

- Harness JSON: `/Users/bencharney/Library/Application Support/xyz.block.buzz.app/custom_harnesses/iii_bridge.json`
- Bridge script: `/Users/bencharney/activity-feed/tools/iii-buzz-acp/iii_buzz_acp.py`

This bridge is now **session-backed**: it speaks ACP for Buzz, starts/reuses an iii-backed session, records prompt/response observations, and pulls iii context/summaries. It still does not expose a full native iii model-turn runtime.

### Local verification done

- Custom harness JSON written to the Buzz app-data `custom_harnesses/` directory.
- ACP handshake verified directly against the bridge:
  - `initialize`
  - `session/new`
  - repeated `session/prompt`
  - streamed `session/update`
  - final `stopReason: end_turn`
- Backing iii session lifecycle also verified through the bridge path.

### Local rollback

```bash
rm -f ~/Library/Application\ Support/xyz.block.buzz.app/custom_harnesses/iii_bridge.json
rm -rf /Users/bencharney/activity-feed/tools/iii-buzz-acp
```

Restart Buzz after rollback or after replacing the bridge.

## Security notes

- No Buzz secrets are committed to this repo.
- The initial owner secret was delivered out-of-band, not written to tracked docs.
- Buzz uses its own Postgres, Redis, MinIO, and git data volumes, separate from the Activity Feed stack.
- The relay remains tailnet-only unless a future change intentionally exposes it on a public domain.
