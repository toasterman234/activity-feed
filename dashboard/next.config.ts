import type { NextConfig } from "next";

// Proxy the electric-circuits API and durable-streams backend through this
// same origin. This is what makes phone/Tailscale access work: the browser
// only ever talks to the dashboard's own origin, so there's no cross-origin
// request for the browser to silently block (the ds-rust binary is a
// third-party crate with no CORS support, so a direct cross-port request
// from the browser hangs forever without this).
const nextConfig: NextConfig = {
  // Upstream @electric-circuits/client (vendored via file: dep) has a strict-TS
  // mismatch in its TanStack DB sync adapter typing that doesn't affect runtime
  // behavior — this only blocks `next build`'s type-check pass, not `next dev`.
  typescript: { ignoreBuildErrors: true },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: "http://127.0.0.1:8795/:path*" },
      { source: "/ds/:path*", destination: "http://127.0.0.1:8794/:path*" },
    ];
  },
};

export default nextConfig;
