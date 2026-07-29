/**
 * Shared client helper for advancing/transitioning a thread.
 *
 * All UI controls (StageActionBar, workspaces) use this single path
 * so there is exactly one semantics for advance/transition.
 */

interface AdvanceOptions {
  threadId: string;
  channelId: string;
  mode: "agent" | "transition";
  toState?: string;
}

interface AdvanceResult {
  ok: boolean;
  error?: string;
}

export async function advanceThread(opts: AdvanceOptions): Promise<AdvanceResult> {
  const { threadId, channelId, mode, toState } = opts;

  if (mode === "agent") {
    const res = await fetch("/api/channels/advance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId, channelId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || `Advance failed (${res.status})` };
    }
    return { ok: true };
  }

  if (mode === "transition" && toState) {
    const res = await fetch("/api/channels/transition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId, channelId, toState, actor: "you" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || `Transition failed (${res.status})` };
    }
    return { ok: true };
  }

  return { ok: false, error: "Invalid advance mode or missing toState" };
}
