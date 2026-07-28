export type AttentionNeed = "triage" | "review" | "blocked" | "gate" | "verify";

export type ThreadAttentionGuide = {
  need: AttentionNeed;
  why: string;
  nextStep: string;
  cta: string;
};

export function deriveThreadAttention(opts: {
  lifecycle: string;
  state: string;
  assignee?: string | null;
  repoId?: string | null;
  promotionStatus?: string | null;
}): ThreadAttentionGuide | null {
  const lifecycle = opts.lifecycle || "";
  const state = opts.state || "";
  const assignee = (opts.assignee || "").trim();
  const repoId = opts.repoId || null;

  if (opts.promotionStatus === "failed_required_gate" || opts.promotionStatus === "errored") {
    return {
      need: "gate",
      why: "A required promotion/gate failed.",
      nextStep: "Fix the failed gate in this thread, then retry promotion.",
      cta: "See promotion status",
    };
  }

  if (state === "blocked") {
    return {
      need: "blocked",
      why: "This thread is blocked on a missing decision or input.",
      nextStep: "Record the blocker and unblocking action, then advance.",
      cta: "Unblock in GuideBar",
    };
  }

  if (lifecycle === "issue" && state === "open" && (!assignee || !repoId)) {
    const missing = [
      !assignee ? "owner" : null,
      !repoId ? "repo" : null,
    ].filter(Boolean).join(" and ");
    return {
      need: "triage",
      why: `Open issue is unscoped (missing ${missing}).`,
      nextStep: "Assign an owner and link a repo below, then triage/advance.",
      cta: "Assign owner / repo",
    };
  }

  if (lifecycle === "issue" && state === "resolved") {
    return {
      need: "verify",
      why: "Fix is implemented but still needs verification approval.",
      nextStep: "Run the verify/approve workspace below, then close.",
      cta: "Verify fix",
    };
  }

  if (state === "review") {
    if (lifecycle === "research") {
      return {
        need: "review",
        why: "Research synthesis is waiting for verification/publication approval.",
        nextStep: "Use the review workspace below to verify and approve publication.",
        cta: "Review synthesis",
      };
    }
    if (lifecycle === "coding") {
      return {
        need: "review",
        why: "Change is waiting on ship review approval.",
        nextStep: "Use the review workspace below to approve shipping.",
        cta: "Review before shipping",
      };
    }
    if (lifecycle === "planning") {
      return {
        need: "review",
        why: "Plan is waiting on challenge/approval.",
        nextStep: "Use the review workspace below to challenge and approve the plan.",
        cta: "Challenge plan",
      };
    }
    return {
      need: "review",
      why: "Waiting on a human review gate.",
      nextStep: "Complete the pending review/approval in the workspace below.",
      cta: "Open review",
    };
  }

  return null;
}
