// Service worker entry for @serwist/next (injectManifest mode).
// This file is compiled by Serwist — it runs in the service worker global scope,
// not in the browser or Node.

// @ts-nocheck — SW global scope types

import { installSerwist } from "serwist/legacy";
import { defaultCache } from "@serwist/next/worker";
import { NetworkFirst } from "serwist";

// Prepend custom runtime caching rules before the default Next.js rules.
// Later rules take precedence for the same URL, so our /api and /ds rules
// must come AFTER defaultCache in the array (last match wins).
const runtimeCaching = [
  ...defaultCache,
  {
    urlPattern: ({ url }: { url: URL }) =>
      url.pathname.startsWith("/api/") || url.pathname.startsWith("/ds/"),
    handler: new NetworkFirst({
      cacheName: "api-ds",
      networkTimeoutSeconds: 10,
    }),
    method: "GET" as const,
  },
  // Static assets from Next.js builds — cache-first, long-lived.
  {
    urlPattern: ({ url }: { url: URL }) =>
      url.pathname.startsWith("/_next/static/") ||
      url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff2?)$/),
    handler: "CacheFirst" as const,
    options: {
      cacheName: "static-assets",
      expiration: {
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      },
    },
  },
];

installSerwist({
  precacheEntries: self.__SW_MANIFEST,
  // Don't skip waiting — we want to show an "Update available" prompt
  // on the client side instead of silently swapping the SW mid-session.
  skipWaiting: false,
  clientsClaim: false,
  runtimeCaching,
  // Navigation preload speeds up navigations when the SW boots.
  navigationPreload: true,
});
