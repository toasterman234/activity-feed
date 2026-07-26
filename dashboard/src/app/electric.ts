import { createClient } from "@electric-circuits/client";
import type { ShapeDef } from "@electric-circuits/protocol";
import { schema } from "./schema";

// The electric-circuits client needs to reach the tRPC API and durable-streams
// backend. Both are proxied through this same origin via Next.js rewrites
// (/api -> :8795, /ds -> :8794, see next.config.ts) so the browser never makes
// a cross-origin request — this is what makes phone/Tailscale access work,
// since the ds-rust binary has no CORS support.
const origin = typeof window !== "undefined" ? window.location.origin : "";

export const client = createClient({
  apiUrl: `${origin}/api`,
  schema,
  dsBaseUrl: `${origin}/ds`,
  liveMode: "long-poll",
});

export const ACTIVITY_LOG_SHAPE: ShapeDef = {
  table: "activity_log",
};

export const POSITIONS_SHAPE: ShapeDef = {
  table: "portfolio_positions",
};

export const TRADES_SHAPE: ShapeDef = {
  table: "portfolio_trades",
};

export const BALANCES_SHAPE: ShapeDef = {
  table: "portfolio_balances",
};

export const TRANSACTIONS_SHAPE: ShapeDef = {
  table: "portfolio_transactions",
};

export const NET_WORTH_SHAPE: ShapeDef = {
  table: "portfolio_net_worth",
};

export const BENCHMARKS_SHAPE: ShapeDef = {
  table: "portfolio_benchmarks",
};

export const ALLOCATION_SHAPE: ShapeDef = {
  table: "portfolio_allocation",
};

export const AGENT_RUNS_SHAPE: ShapeDef = {
  table: "agent_runs",
};

export const COLLECTIONS_SHAPE: ShapeDef = {
  table: "judgment_collections",
};

export const JUDGMENTS_SHAPE: ShapeDef = {
  table: "judgments",
};

export const CHANNELS_SHAPE: ShapeDef = {
  table: "channels",
};

export const CHANNEL_MEMBERS_SHAPE: ShapeDef = {
  table: "channel_members",
};

export const MESSAGES_SHAPE: ShapeDef = {
  table: "messages",
};

export const THREAD_PLANS_SHAPE: ShapeDef = {
  table: "thread_plans",
};

export const THREAD_WORKFLOW_STEPS_SHAPE: ShapeDef = {
  table: "thread_workflow_steps",
};

export const THREAD_ARTIFACTS_SHAPE: ShapeDef = {
  table: "thread_artifacts",
};

export const REPOS_SHAPE: ShapeDef = {
  table: "repos",
};

// thread_meta is polled (client.query), not a held live shape (ADR-003).
// The shape def is kept here for query table-name reference only.
export const THREAD_META_SHAPE = {
  table: "thread_meta",
};

// thread_promotions is also polled (not held live).
export const THREAD_PROMOTIONS_SHAPE = {
  table: "thread_promotions",
};
