import { NextResponse } from "next/server";

import {
  collectSubscriptionsLive,
  hasUsableSubscriptions,
  readSubscriptionsSnapshot,
} from "@/lib/subscriptions/collector.mjs";

let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL_MS = 5 * 60_000;
const MAX_STALE_MS = 15 * 60_000;

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  const preferSnapshot = process.env.NODE_ENV === "production";
  const snapshot = preferSnapshot ? await readSubscriptionsSnapshot() : null;
  if (hasUsableSubscriptions(snapshot)) {
    cache = { data: snapshot, ts: now };
    return NextResponse.json(snapshot);
  }

  const live = await collectSubscriptionsLive();
  if (hasUsableSubscriptions(live)) {
    cache = { data: live, ts: Date.now() };
    return NextResponse.json(live);
  }

  if (cache && now - cache.ts < MAX_STALE_MS) {
    return NextResponse.json(cache.data);
  }

  return NextResponse.json(live);
}
