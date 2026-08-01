import { NextResponse } from "next/server";
import {
  getChannelRollups, fetchThreadActivity, fetchActiveWork,
  fetchRecentAgentActivity, fetchThreadTududi, fetchApprovedPlans,
  snippet, firstLine,
} from "../_queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [channels, threadsRes, workRes, agentRes, threadTududiRes, plansRes] = await Promise.all([
      getChannelRollups("you"),
      fetchThreadActivity(),
      fetchActiveWork(),
      fetchRecentAgentActivity(),
      fetchThreadTududi(),
      fetchApprovedPlans(),
    ]);

    // Thread→Tududi map
    const threadTududiMap = new Map<string, Array<{
      externalId: string; taskName: string; taskUid: string; projectName: string;
    }>>();
    for (const row of (threadTududiRes?.rows || [])) {
      const markers = row.body.matchAll(/tududi::task:(iii:tv:[^\s\]]+)/g);
      const refs: typeof threadTududiMap extends Map<any, infer V> ? V : never = [];
      const seen = new Set<string>();
      for (const m of markers) {
        const extId = m[1];
        if (seen.has(extId)) continue;
        seen.add(extId);
        refs.push({
          externalId: extId,
          taskName: extId.split(":").pop() || extId,
          taskUid: "",
          projectName: "",
        });
      }
      if (refs.length > 0) threadTududiMap.set(row.thread_id, refs);
    }

    const channelNames = new Map(channels.map(c => [c.channelId, c.channelName] as const));

    const threadActivity = (threadsRes?.rows || []).map((row) => ({
      threadId: row.thread_id,
      channelId: row.channel_id,
      channelName: row.channel_name,
      title: firstLine(row.title),
      lifecycle: row.lifecycle,
      state: row.state,
      assignee: row.assignee,
      repoName: row.repo_name,
      replyCount: Number(row.reply_count) || 0,
      lastAuthor: row.last_author,
      lastMessageAt: row.last_message_at,
      updatedAt: row.updated_at,
      tududiTasks: threadTududiMap.get(row.thread_id) || [],
    }));

    const activeThreads = (workRes?.rows || []).map((row) => ({
      threadId: row.thread_id,
      channelId: row.channel_id,
      channelName: row.channel_name,
      title: firstLine(row.title),
      lifecycle: row.lifecycle,
      state: row.state,
      latestStep: row.step_label ? {
        label: row.step_label,
        status: row.step_status || "pending",
        detail: row.step_detail,
        createdAt: row.step_created_at,
      } : null,
      promotion: row.promotion_status ? {
        status: row.promotion_status,
        progress: row.promotion_progress,
      } : null,
      tududiTasks: threadTududiMap.get(row.thread_id) || [],
    }));

    const recentAgentActivity = (agentRes?.rows || []).map((row) => ({
      author: row.author,
      source: row.author.replace(/^@/, ""),
      snippet: snippet(row.body, 90),
      createdAt: row.created_at,
      channelId: row.channel_id,
      channelName: channelNames.get(row.channel_id) || null,
      threadId: row.thread_id,
    }));

    const approvedPlans = (plansRes?.rows || []).map((row) => ({
      threadId: row.thread_id,
      channelId: row.channel_id,
      channelName: row.channel_name,
      title: firstLine(row.title),
      repoName: row.repo_name,
      repoId: row.repo_id,
      assignee: row.assignee,
      taskCount: Number(row.task_count) || 0,
      approvedAt: row.approved_at,
      updatedAt: row.updated_at,
      activeExecutionCount: Number(row.active_execution_count) || 0,
    }));

    const unreadChannels = channels.filter(c => c.unreadCount > 0);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summaryCounts: {
        unread: unreadChannels.length,
        needsMe: 0, // handled by /api/home/needs-you
        active: activeThreads.length,
        failed: 0, // handled by /api/home/needs-you
        agentsDown: false, // handled by /api/home/summary
      },
      topThreads: threadActivity.slice(0, 3),
      topActive: activeThreads.slice(0, 3),
      topPulse: channels.slice(0, 2),
      threadActivity,
      workStatus: { active: activeThreads },
      approvedPlans,
      channels,
      agents: {
        recentActivity: recentAgentActivity,
      },
    });
  } catch (error) {
    console.error("[home/activity] failed:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
