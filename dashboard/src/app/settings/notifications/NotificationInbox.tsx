"use client";

// In-app notification inbox — shows dispatched notifications with read/dismiss.
// Polls GET /api/notifications/inbox for list + unread count.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Notification {
  id: string;
  event: string;
  urgency: string;
  thread_id: string;
  channel_id: string;
  title: string;
  body: string;
  app_url: string;
  actor: string | null;
  read: boolean;
  dismissed: boolean;
  created_at: string;
}

const EVENT_LABELS: Record<string, string> = {
  "workflow.blocked": "🚫 Blocked",
  "workflow.approval_required": "✅ Approval",
  "work_run.completed": "✅ Run done",
  "work_run.failed": "❌ Run failed",
  "work_run.interrupted": "⏸️ Interrupted",
  "verification.passed": "✓ Checks OK",
  "verification.failed": "✗ Checks failed",
  "deployment.completed": "🚀 Deployed",
  "deployment.failed": "💥 Deploy failed",
  "task.reply": "💬 Reply",
  "stage.transitioned": "↪ State change",
};

export default function NotificationInbox() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetchInbox = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/inbox?limit=30");
      const data = await res.json();
      if (data.ok) {
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch {
      // Quiet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInbox();
    // Poll every 30s
    const interval = setInterval(fetchInbox, 30_000);
    return () => clearInterval(interval);
  }, [fetchInbox]);

  const markAllRead = async () => {
    try {
      await fetch("/api/notifications/inbox", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read-all" }),
      });
      await fetchInbox();
    } catch {}
  };

  const dismissOne = async (id: string) => {
    try {
      await fetch("/api/notifications/inbox", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", ids: [id] }),
      });
      await fetchInbox();
    } catch {}
  };

  const markRead = async (id: string) => {
    try {
      await fetch("/api/notifications/inbox", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read", ids: [id] }),
      });
      await fetchInbox();
    } catch {}
  };

  const visibleNotifications = notifications.filter((n) => !n.dismissed);

  return (
    <div className="space-y-3">
      {/* Bell + unread badge */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Recent Notifications
          </h3>
          {unreadCount > 0 && (
            <p className="text-[11px] text-zinc-400">{unreadCount} unread</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              Mark all read
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className={`text-xs text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            ▼
          </button>
        </div>
      </div>

      {/* Expanded list */}
      {expanded && (
        loading ? (
          <div className="animate-pulse space-y-2">
            <div className="h-12 bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
            <div className="h-12 bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
          </div>
        ) : visibleNotifications.length === 0 ? (
          <div className="rounded-lg bg-zinc-50 px-4 py-6 text-center text-xs text-zinc-400 dark:bg-zinc-900">
            No notifications yet. They will appear here when work runs complete, verifications pass, or deployments happen.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {visibleNotifications.map((n) => (
              <div
                key={n.id}
                className={`rounded-lg border px-3 py-2.5 transition-colors ${
                  n.read
                    ? "border-zinc-100 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                    : "border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/20"
                }`}
                onClick={() => !n.read && markRead(n.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={n.app_url}
                    className="min-w-0 flex-1"
                    onClick={(e) => !n.read && markRead(n.id)}
                  >
                    <div className="flex items-center gap-1.5">
                      {!n.read && (
                        <span className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />
                      )}
                      <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                        {EVENT_LABELS[n.event] || n.event}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-900 dark:text-zinc-100 truncate mt-0.5">
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                        {n.body}
                      </p>
                    )}
                    <p className="text-[10px] text-zinc-400 mt-1">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </Link>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissOne(n.id);
                    }}
                    className="text-[10px] text-zinc-300 hover:text-zinc-500 flex-shrink-0 pt-0.5"
                    title="Dismiss"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
