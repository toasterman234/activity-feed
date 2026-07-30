"use client";

// Notification preference toggles — master switch + per-event-type controls.
// Talks to GET/PUT /api/notifications/preferences.

import { useCallback, useEffect, useState } from "react";

interface Preference {
  id: string;
  scope: string;
  scope_value: string | null;
  enabled: boolean;
  delivery_mode: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  lock_screen_preview: boolean;
}

interface Effective {
  [eventType: string]: {
    enabled: boolean;
    delivery_mode: string;
  };
}

const EVENT_GROUPS: Array<{
  label: string;
  events: Array<{ key: string; label: string; description: string }>;
}> = [
  {
    label: "Workflow",
    events: [
      { key: "workflow.blocked", label: "Stage blocked", description: "A stage transition is blocked by a gate" },
      { key: "workflow.approval_required", label: "Approval required", description: "A proposal needs approval" },
    ],
  },
  {
    label: "Work Runs",
    events: [
      { key: "work_run.completed", label: "Run completed", description: "An agent finished its work run" },
      { key: "work_run.failed", label: "Run failed", description: "A work run failed" },
      { key: "work_run.interrupted", label: "Run interrupted", description: "A work run was interrupted or timed out" },
    ],
  },
  {
    label: "Verification",
    events: [
      { key: "verification.passed", label: "Checks passed", description: "All verification checks passed" },
      { key: "verification.failed", label: "Checks failed", description: "A verification check failed" },
    ],
  },
  {
    label: "Deployment",
    events: [
      { key: "deployment.completed", label: "Deploy completed", description: "A deployment succeeded" },
      { key: "deployment.failed", label: "Deploy failed", description: "A deployment failed" },
    ],
  },
  {
    label: "Tasks",
    events: [
      { key: "task.reply", label: "Task reply", description: "A message appears on a watched task thread" },
    ],
  },
];

export default function NotificationSettings() {
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [effective, setEffective] = useState<Effective>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPreferences = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/preferences");
      const data = await res.json();
      if (data.ok) {
        setPreferences(data.preferences);
        setEffective(data.effective);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const toggleEvent = async (eventKey: string, enabled: boolean) => {
    const prev = { ...effective };
    setEffective((e) => ({
      ...e,
      [eventKey]: { ...e[eventKey], enabled },
    }));

    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "event_type",
          scope_value: eventKey,
          enabled,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setEffective(prev);
        setError(data.error);
      } else {
        await loadPreferences();
      }
    } catch (err) {
      setEffective(prev);
      setError(String(err));
    }
  };

  const toggleMaster = async (enabled: boolean) => {
    const prev = { ...effective };
    // Optimistically update all
    setEffective((e) => {
      const next = { ...e };
      for (const key of Object.keys(next)) {
        next[key] = { ...next[key], enabled };
      }
      return next;
    });

    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "global", enabled }),
      });
      const data = await res.json();
      if (!data.ok) {
        setEffective(prev);
        setError(data.error);
      } else {
        await loadPreferences();
      }
    } catch (err) {
      setEffective(prev);
      setError(String(err));
    }
  };

  const globalEnabled = preferences.find((p) => p.scope === "global" && p.scope_value == null)?.enabled ?? true;

  if (loading) {
    return <div className="animate-pulse space-y-3">
      <div className="h-16 bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
      <div className="h-24 bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
    </div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Notification Preferences</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Choose which events send push notifications to your phone.</p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Master switch */}
      <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-card px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Master Switch</p>
          <p className="text-[11px] text-zinc-400">Turn all notifications on or off</p>
        </div>
        <button
          onClick={() => toggleMaster(!globalEnabled)}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            globalEnabled ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-300 dark:bg-zinc-700"
          }`}
          role="switch"
          aria-checked={globalEnabled}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-card shadow-sm transition-transform ${
              globalEnabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Event groups */}
      {globalEnabled && EVENT_GROUPS.map((group) => (
        <div key={group.label} className="space-y-1.5">
          <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">{group.label}</p>
          {group.events.map((ev) => {
            const eff = effective[ev.key] || { enabled: true, delivery_mode: "immediate" };
            return (
              <div
                key={ev.key}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-card px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="min-w-0 flex-1 mr-3">
                  <p className="text-sm text-zinc-900 dark:text-zinc-100">{ev.label}</p>
                  <p className="text-[10px] text-zinc-400 truncate">{ev.description}</p>
                </div>
                <button
                  onClick={() => toggleEvent(ev.key, !eff.enabled)}
                  className={`relative h-5 w-9 rounded-full transition-colors flex-shrink-0 ${
                    eff.enabled ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-300 dark:bg-zinc-700"
                  }`}
                  role="switch"
                  aria-checked={eff.enabled}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-card shadow-sm transition-transform ${
                      eff.enabled ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
