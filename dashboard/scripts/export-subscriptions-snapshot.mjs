#!/usr/bin/env node

import {
  collectSubscriptionsLive,
  hasUsableSubscriptions,
  SUBSCRIPTIONS_SNAPSHOT_PATH,
  writeSubscriptionsSnapshot,
} from "../src/lib/subscriptions/collector.mjs";

const result = await collectSubscriptionsLive();

if (!hasUsableSubscriptions(result)) {
  const summary = result.errors?.length ? result.errors.join(" | ") : "no accounts returned";
  console.error(`subscriptions snapshot export failed: ${summary}`);
  process.exit(1);
}

const path = await writeSubscriptionsSnapshot(result);
console.log(`wrote ${path}`);
console.log(`accounts=${result.accounts.length}`);
console.log(`generated_at=${result.generated_at}`);
console.log(`default_path=${SUBSCRIPTIONS_SNAPSHOT_PATH}`);
