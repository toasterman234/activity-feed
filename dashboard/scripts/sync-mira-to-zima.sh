#!/bin/bash
# Sync Mira research cases from Mac to Zima (OVH VPS).
# Run on Mac. Requires Tailscale and SSH access to ovh-vps.
#
# Usage: bash scripts/sync-mira-to-zima.sh
#
# Prerequisite on Zima: mkdir -p /home/ubuntu/mira-cases

set -euo pipefail

MIRA_SRC="${MIRA_SRC:-$HOME/sandbox/Mira/cases}"
MIRA_DST="${MIRA_DST:-ovhvps:/home/ubuntu/mira-cases/cases}"

if [ ! -d "$MIRA_SRC" ]; then
  echo "ERROR: Mira cases source not found at $MIRA_SRC" >&2
  exit 1
fi

echo "Syncing Mira cases → Zima..."
rsync -avz --delete \
  --include='*/' \
  --include='research-package-manifest.json' \
  --include='company-map.csv' \
  --exclude='*' \
  "$MIRA_SRC/" "$MIRA_DST/"
echo "Done. Refresh snapshot from Research tab or POST /api/finance/refresh-snapshot."
