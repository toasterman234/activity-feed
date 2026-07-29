// Service worker entry for @serwist/next (injectManifest mode).
// This file is compiled by Serwist — it runs in the service worker global scope,
// not in the browser or Node.

// @ts-nocheck — SW global scope types

import { installSerwist } from "serwist/legacy";
import { defaultCache } from "@serwist/next/worker";
import { NetworkFirst } from "serwist";

// ---------------------------------------------------------------------------
// Web Push handlers (Phase 2 notifications)
// ---------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    const { title, body, icon, badge, data } = payload;
    event.waitUntil(
      self.registration.showNotification(title, {
        body: body || "",
        icon: icon || "/icon-192.png",
        badge: badge || "/icon-192.png",
        data: data || {},
        tag: data?.tag || "activity-dashboard",
        requireInteraction: data?.urgency === "high",
        vibrate: [200, 100, 200],
      }),
    );
  } catch {
    // Non-JSON push (e.g. test ping) — show generic
    event.waitUntil(
      self.registration.showNotification("Activity Dashboard", {
        body: event.data.text() || "New notification",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
      }),
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const appUrl = event.notification.data?.app_url;
  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // If a window is already open, focus it and navigate
      for (const client of windowClients) {
        if (client.url.includes(self.location.hostname) && "focus" in client) {
          await client.focus();
          if (appUrl && "navigate" in client) {
            return client.navigate(appUrl);
          }
          return;
        }
      }
      // Otherwise open a new window
      if (appUrl) {
        return self.clients.openWindow(appUrl);
      }
      return self.clients.openWindow("/");
    })(),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      // The old subscription was removed/expired.
      // Notify the server so it can clean up the stale record.
      const oldSub = event.oldSubscription;
      if (oldSub) {
        try {
          await fetch("/api/notifications/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: oldSub.endpoint }),
          });
        } catch {
          // Non-critical; server will clean up on delivery failure
        }
      }
      // The new subscription (if any) will be sent by the client page
      // in a separate POST when it detects the change.
    })(),
  );
});

// ---------------------------------------------------------------------------
// Serwist install
// ---------------------------------------------------------------------------

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
