import type { NextRequest } from "next/server";

// Proxy to the durable-streams backend ourselves instead of using next.config's
// rewrites() — Next's built-in dev-server rewrite proxy resets long-lived
// connections (ECONNRESET/"socket hang up") within a couple seconds, which
// breaks `live=long-poll` shape subscriptions (they're meant to hang open for
// up to ~30s waiting for new data). A plain streamed fetch here has no such
// timeout, so the long-poll can actually complete.
const DS_ORIGIN = "http://127.0.0.1:8791";

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const url = `${DS_ORIGIN}/${path.join("/")}${req.nextUrl.search}`;
  // no-store: shape snapshots must always reflect the current stream position —
  // Next's fetch cache would otherwise serve a stale snapshot from an earlier
  // request to this same URL (offset=0 on every fresh page load looks identical).
  const upstream = await fetch(url, { headers: req.headers, signal: req.signal, cache: "no-store" });
  // fetch() transparently gunzips the body but leaves content-encoding/length
  // describing the original (compressed) wire format — forwarding those as-is
  // would make the client try to gunzip already-decoded bytes. Drop them and
  // let the runtime recompute framing for the passthrough body.
  const headers = new Headers(upstream.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  // The ds backend sends a cacheable cache-control (meant for its own static
  // assets) — forwarding it verbatim lets the browser serve a stale shape
  // snapshot on reload for its stale-while-revalidate window. Override it.
  headers.set("cache-control", "no-store");
  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}

export const dynamic = "force-dynamic";
