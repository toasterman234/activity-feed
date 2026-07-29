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
  /** True when a guided-review proposal exists and is waiting on human approval. */
  hasActiveReviewProposal?: boolean;
}): ThreadAttentionGuide | null {
  const lifecycle = opts.lifecycle || "";
  const state = opts.state || "";
  const assignee = (opts.assignee || "").trim();
  const repoId = opts.repoId || null;
  const hasProposal = Boolean(opts.hasActiveReviewProposal);

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
      cta: "Unblock via Stage Action Bar",
    };
  }

  if (lifecycle === "issue" && state === "open" && !assignee) {
    return {
      need: "triage",
      why: "Open issue has no owner assigned.",
      nextStep: "Assign an owner below, then triage/advance.",
      cta: "Assign owner",
    };
  }

  if (lifecycle === "issue" && state === "resolved") {
    return {
      need: "verify",
      why: hasProposal
        ? "Verification review is ready — still needs your approval to close."
        : "Fix is implemented but still needs verification approval.",
      nextStep: hasProposal
        ? "Read the review below, then Approve to close the issue."
        : "Run the verify/approve workspace below, then close.",
      cta: hasProposal ? "Approve verification" : "Verify fix",
    };
  }

  if (state === "review") {
    if (lifecycle === "research") {
      return {
        need: "review",
        why: hasProposal
          ? "Review is ready — publication still needs your approval."
          : "Research synthesis is waiting for verification/publication approval.",
        nextStep: hasProposal
          ? "Read the assessment below, then Approve research synthesis."
          : "Use the review workspace below to run verification, then approve publication.",
        cta: hasProposal ? "Approve publication" : "Review synthesis",
      };
    }
    if (lifecycle === "coding") {
      return {
        need: "review",
        why: hasProposal
          ? "Ship review is ready — still needs your approval."
          : "Change is waiting on ship review approval.",
        nextStep: hasProposal
          ? "Read the review below, then Approve shipping."
          : "Use the review workspace below to run the review, then approve shipping.",
        cta: hasProposal ? "Approve shipping" : "Review before shipping",
      };
    }
    if (lifecycle === "planning") {
      return {
        need: "review",
        why: hasProposal
          ? "Plan challenge is ready — still needs your approval."
          : "Plan is waiting on challenge/approval.",
        nextStep: hasProposal
          ? "Read the challenge below, then Approve plan (or apply the revised plan)."
          : "Use the review workspace below to challenge and approve the plan.",
        cta: hasProposal ? "Approve plan" : "Challenge plan",
      };
    }
    return {
      need: "review",
      why: hasProposal
        ? "Review is ready — still needs your approval."
        : "Waiting on a human review gate.",
      nextStep: hasProposal
        ? "Read the review below, then Approve."
        : "Complete the pending review/approval in the workspace below.",
      cta: hasProposal ? "Approve review" : "Open review",
    };
  }

  return null;
}
