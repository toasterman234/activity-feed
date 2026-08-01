#!/usr/bin/env bash
# serve.sh — start the Theme Lab on your tailnet
# Access from phone at: http://100.71.118.10:3333
set -euo pipefail

cd "$(dirname "$0")"

echo ""
echo "🎨 Theme Lab"
echo "   Serving on: http://100.71.118.10:3333"
echo "   Phone → open that URL in your browser"
echo "   Press Ctrl+C to stop"
echo ""

# Use npx serve if available, otherwise Python, otherwise Node
if command -v npx &>/dev/null; then
  npx --yes serve@latest . --listen 3333 --cors 2>/dev/null &
  wait
elif command -v python3 &>/dev/null; then
  python3 -m http.server 3333 --bind 0.0.0.0
elif command -v python &>/dev/null; then
  python -m SimpleHTTPServer 3333
else
  echo "Need Python or Node to serve. Install one."
  exit 1
fi
