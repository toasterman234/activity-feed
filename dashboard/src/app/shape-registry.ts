import type { ShapeMaterialization } from "@electric-circuits/client";

/**
 * Refcounted cache for live Electric shapes.
 *
 * WHY THIS EXISTS — see docs/decisions/ADR-001-shape-stream-lifecycle.md
 * and AGENTS.md ("Live sync / HTTP connections").
 *
 * Module-level `let cache = client.shape(...)` without close() keeps every
 * long-poll alive forever. Over plain HTTP/1.1 the browser allows ~6
 * connections per origin — once Activity (3 shapes) + Channels (3 shapes)
 * are open, navigation freezes and Next's "Rendering" pill sticks.
 *
 * acquire/release: pages bump a ref on mount and drop it on unmount; at 0
 * we close the stream (after a short grace period so SPA navigations that
 * remount the same shape don't thrash). Pass `{ immediate: true }` for
 * heavy shapes (activity feed) that must free connections before the next
 * page opens its own streams.
 *
 * Do NOT reintroduce module-level shape caches that skip this registry.
 */
type Entry = {
  promise: Promise<ShapeMaterialization>;
  refs: number;
};

const registry = new Map<string, Entry>();
const pendingClose = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Live-shape budget. HTTP/1.1 allows ~6 connections per origin (phone/Tailscale
 * access is plain HTTP), and Next.js needs headroom for navigation/RSC fetches
 * plus API writes. No page may hold more than this many live shapes at once.
 *
 * If you hit this limit, do NOT raise it — combine shapes, or use
 * `client.query()` polling for secondary data (see ADR-003).
 */
export const SHAPE_BUDGET = 4;

function activeKeys(): string[] {
  const keys: string[] = [];
  for (const [key, entry] of registry) if (entry.refs > 0) keys.push(key);
  return keys;
}

/** Delay before closing — covers Next client navigations that unmount then
 *  remount a page needing the same shape. */
const CLOSE_GRACE_MS = 750;

function scheduleClose(key: string, delayMs: number): void {
  const existing = pendingClose.get(key);
  if (existing) clearTimeout(existing);

  const run = () => {
    pendingClose.delete(key);
    const e = registry.get(key);
    if (!e || e.refs > 0) return;
    registry.delete(key);
    void e.promise
      .then((mat) => mat.close())
      .catch(() => {
        /* shape may already be gone */
      });
  };

  if (delayMs <= 0) {
    run();
    return;
  }
  pendingClose.set(key, setTimeout(run, delayMs));
}

export function acquireShape(
  key: string,
  factory: () => Promise<ShapeMaterialization>,
): Promise<ShapeMaterialization> {
  const pending = pendingClose.get(key);
  if (pending) {
    clearTimeout(pending);
    pendingClose.delete(key);
  }

  let entry = registry.get(key);
  if (!entry) {
    entry = { promise: factory(), refs: 0 };
    registry.set(key, entry);
  }
  entry.refs += 1;

  const active = activeKeys();
  if (active.length > SHAPE_BUDGET) {
    const msg =
      `shape-registry: ${active.length} live shapes exceed SHAPE_BUDGET=${SHAPE_BUDGET} ` +
      `(browser allows ~6 HTTP/1.1 connections/origin; navigation needs headroom). ` +
      `Open: [${active.join(", ")}]. Combine shapes or poll with client.query() ` +
      `instead of adding streams — see docs/decisions/ADR-003.`;
    if (process.env.NODE_ENV !== "production") throw new Error(msg);
    console.error(msg);
  }

  return entry.promise;
}

export function releaseShape(
  key: string,
  opts?: { immediate?: boolean },
): void {
  const entry = registry.get(key);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;
  scheduleClose(key, opts?.immediate ? 0 : CLOSE_GRACE_MS);
}
