import { NextResponse } from "next/server";
import { fetchApprovalThreads, fetchFailedPromotions, threadAttentionGuide, firstLine } from "../_queries";
import { deriveThreadAttention } from "@/app/channels/attentionGuide";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [approvalsRes, promotionsRes] = await Promise.all([
      fetchApprovalThreads(),
      fetchFailedPromotions(),
    ]);

    const approvalThreads = (approvalsRes?.rows || []).map((row) => {
      const guide = threadAttentionGuide({
        lifecycle: row.lifecycle, state: row.state, reason: row.reason as any,
        assignee: row.assignee, repoId: row.repo_id,
        hasActiveReviewProposal: Boolean(row.has_active_review_proposal),
      });
      return {
        threadId: row.thread_id,
        channelId: row.channel_id,
        channelName: row.channel_name,
        title: firstLine(row.title),
        lifecycle: row.lifecycle,
        state: row.state,
        assignee: row.assignee,
        reason: row.reason,
        updatedAt: row.updated_at,
        why: guide.why,
        nextStep: guide.nextStep,
        need: deriveThreadAttention({
          lifecycle: row.lifecycle, state: row.state, assignee: row.assignee,
          repoId: row.repo_id,
          promotionStatus: row.reason === "failed_required_gate" ? "failed_required_gate" : null,
          hasActiveReviewProposal: Boolean(row.has_active_review_proposal),
        })?.need || null,
      };
    });

    const failedPromotions = (promotionsRes?.rows || []).map((row) => ({
      threadId: row.thread_id,
      channelId: row.channel_id,
      channelName: row.channel_name,
      status: row.status,
      progress: row.progress,
      errorDetail: row.error_detail,
      createdAt: row.created_at,
      why: row.error_detail || row.progress || "Promotion/gate failed.",
      nextStep: "Open the thread → Stage Action Bar → resolve the failed gate, then retry promotion.",
    }));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      topNeedsMe: approvalThreads.slice(0, 8),
      needsAttention: {
        approvalThreads,
        failedPromotions,
      },
    });
  } catch (error) {
    console.error("[home/needs-you] failed:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
