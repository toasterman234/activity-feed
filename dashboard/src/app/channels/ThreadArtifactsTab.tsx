"use client";

import type { ThreadArtifactRow } from "./shapes";

export type ThreadArtifactsTabProps = {
  artifacts: ThreadArtifactRow[];
};

export function ThreadArtifactsTab({ artifacts }: ThreadArtifactsTabProps) {
  if (artifacts.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
        No artifacts yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {artifacts.map((artifact) => (
        <details key={artifact.id} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900" open>
          <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-wide text-zinc-400">
            Artifact — {artifact.title}{" "}
            <span className="normal-case text-zinc-300 dark:text-zinc-600">({artifact.kind}{artifact.version > 1 ? `, v${artifact.version}` : ""})</span>
          </summary>
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-50 p-2 text-[11px] text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
            {artifact.content}
          </pre>
        </details>
      ))}
    </div>
  );
}
