"use client";

import type { ThreadArtifactRow } from "./shapes";
import { ArtifactContent } from "./ArtifactContent";

export type ThreadArtifactsTabProps = {
  artifacts: ThreadArtifactRow[];
};

export function ThreadArtifactsTab({ artifacts }: ThreadArtifactsTabProps) {
  if (artifacts.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-card p-3 text-xs text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
        No artifacts yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {artifacts.map((artifact) => (
        <details key={artifact.id} className="rounded-lg border border-zinc-200 bg-card p-3 dark:border-zinc-800 dark:bg-zinc-900" open>
          <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-wide text-zinc-400">
            Artifact — {artifact.title}{" "}
            <span className="normal-case text-zinc-300 dark:text-zinc-600">({artifact.kind}{artifact.version > 1 ? `, v${artifact.version}` : ""})</span>
          </summary>
          <div className="mt-2">
            <ArtifactContent kind={artifact.kind} content={artifact.content} />
          </div>
        </details>
      ))}
    </div>
  );
}
