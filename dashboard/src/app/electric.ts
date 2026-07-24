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

export const NET_WORTH_SHAPE: ShapeDef = {
  table: "portfolio_net_worth",
};

export const BENCHMARKS_SHAPE: ShapeDef = {
  table: "portfolio_benchmarks",
};

export const ALLOCATION_SHAPE: ShapeDef = {
  table: "portfolio_allocation",
};
