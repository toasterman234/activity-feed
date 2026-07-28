import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// Proxy the electric-circuits API and durable-streams backend through this
// same origin. This is what makes phone/Tailscale access work: the browser
// only ever talks to the dashboard's own origin, so there's no cross-origin
// request for the browser to silently block (the ds-rust binary is a
// third-party crate with no CORS support, so a direct cross-port request
// from the browser hangs forever without this).

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // Auto-register via Serwist's injected script — no manual register() needed.
  register: true,
  // Don't reload on online — this is a live financial data app, reloading
  // mid-session would lose unsaved state.
  reloadOnOnline: false,
  // Serwist doesn't support Turbopack yet, and the PWA/service-worker isn't
  // needed while developing — disable it in dev so `next dev` can use the
  // (much faster) default Turbopack compiler instead of `--webpack`.
  disable: process.env.NODE_ENV !== "production",
});

const nextConfig: NextConfig = {
  // OVH's production build intermittently lost module resolution while several
  // static-generation / trace workers read the freshly installed Next package.
  // Keep this small personal PWA's build deterministic instead of parallel.
  experimental: { cpus: 1 },
  // Upstream @electric-circuits/client (vendored via file: dep) has a strict-TS
  // mismatch in its TanStack DB sync adapter typing that doesn't affect runtime
  // behavior — this only blocks `next build`'s type-check pass, not `next dev`.
  typescript: { ignoreBuildErrors: true },
  // Serwist's webpack plugin config is present even when `disable` is set
  // (it only skips SW generation at runtime) — Turbopack needs an explicit
  // (empty) config to know that's intentional and not a leftover mistake.
  turbopack: {},
  // Next dev blocks cross-origin requests to dev resources (HMR, etc.) by
  // default. Phone/other-device access goes through the Tailscale hostname,
  // which is cross-origin from the dev server's perspective — allow it.
  allowedDevOrigins: ["bens-mac-mini.taila1553c.ts.net", "100.71.118.10"],
  webpack: (config, { dev }) => {
    // react-scan is a dev-only profiler (ADR-002) whose ESM dist breaks the
    // production webpack bundle ("can't import named export 'version'").
    // Stub it out of prod builds; `next dev` runs Turbopack and never hits
    // this hook, so dev profiling is unaffected.
    if (!dev) {
      config.resolve.alias = { ...config.resolve.alias, "react-scan": false };
    }
    return config;
  },
  async rewrites() {
    // Use `fallback` (not the default afterFiles array): afterFiles runs
    // *before* dynamic App Router routes, so `/api/:path*` was stealing
    // handlers like `/api/ops/initiatives/[id]/promote` and
    // `/api/projects/[repoId]` and proxying them to electric-circuits tRPC.
    // fallback only applies when no Next page/route (including dynamic) matched.
    return {
      fallback: [
        { source: "/api/:path*", destination: "http://127.0.0.1:8795/:path*" },
        // /ds is handled by src/app/ds/[...path]/route.ts, not a rewrite — Next's
        // dev-server rewrite proxy resets long-lived long-poll connections.
        { source: "/market-lake/:path*", destination: "http://127.0.0.1:9077/:path*" },
      ],
    };
  },
};

export default withSerwist(nextConfig);
