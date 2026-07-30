"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { writeChannelRow } from "../writeChannelRow";

export function ProjectQuickWorkComposer({
  repoId,
  hasActiveThread,
}: {
  repoId: string;
  hasActiveThread: boolean;
}) {
  const router = useRouter();
  const [agent, setAgent] = useState("pi");
  const [mode, setMode] = useState<"resume" | "new">(hasActiveThread ? "resume" : "new");
  const [body, setBody] = useState("");
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const launch = async () => {
    const prompt = body.trim();
    if (!prompt || launching) return;
    setLaunching(true);
    setError(null);
    try {
      const workRes = await fetch("/api/projects/work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoId, forceNew: mode === "new" }),
      });
      const work = await workRes.json().catch(() => ({}));
      if (!workRes.ok) throw new Error(work.error || `HTTP ${workRes.status}`);

      const text = `@${agent} ${prompt}`;
      await writeChannelRow("messages", {
        id: crypto.randomUUID(),
        channel_id: work.channelId,
        thread_id: work.threadId,
        author: "you",
        body: text,
        created_at: new Date().toISOString(),
      });
      await fetch("/api/channels/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: work.channelId,
          threadId: work.threadId,
          text,
          mentions: [agent],
        }),
      });
      router.push(String(work.url));
    } catch (e) {
      setError(String(e));
      setLaunching(false);
    }
  };

  return (
    <section className="rounded-lg border border-zinc-200 bg-card p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-100">Work in this project</h2>
          <p className="mt-0.5 text-[10px] text-zinc-400">
            Start from the project page. We will route you into the right thread automatically.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <select
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
          disabled={launching}
          className="rounded border border-zinc-200 bg-card px-2 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        >
          <option value="pi">@pi</option>
          <option value="claude">@claude</option>
          <option value="codex">@codex</option>
        </select>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as "resume" | "new")}
          disabled={launching}
          className="rounded border border-zinc-200 bg-card px-2 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        >
          <option value="resume">Resume active thread</option>
          <option value="new">Start new work thread</option>
        </select>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What do you want to do in this project?"
        rows={4}
        disabled={launching}
        className="mt-3 w-full rounded-md border border-zinc-200 bg-card px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => { void launch(); }}
          disabled={!body.trim() || launching}
          className="rounded border border-emerald-300 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 dark:border-emerald-700"
        >
          {launching ? "Starting…" : "Start working"}
        </button>
        {!hasActiveThread && mode === "resume" && (
          <span className="text-[10px] text-zinc-400">No active thread exists yet — a new one will be created.</span>
        )}
        {error && <span className="text-[10px] text-red-500">{error}</span>}
      </div>
    </section>
  );
}
