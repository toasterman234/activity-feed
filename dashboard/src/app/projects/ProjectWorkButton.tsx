"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

async function startWork(repoId: string, forceNew = false): Promise<string> {
  const res = await fetch("/api/projects/work", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repoId, forceNew }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return String(data.url);
}

export function ProjectWorkButton({
  repoId,
  label = "Work here",
  className,
  forceNew = false,
}: {
  repoId: string;
  label?: string;
  className?: string;
  forceNew?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          void startWork(repoId, forceNew)
            .then((url) => router.push(url))
            .catch((e) => {
              setError(String(e));
              setBusy(false);
            });
        }}
        className={className || "rounded border border-emerald-300 bg-emerald-600 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50 dark:border-emerald-700"}
      >
        {busy ? "Opening…" : label}
      </button>
      {error && <p className="mt-1 text-[10px] text-red-500">{error}</p>}
    </div>
  );
}
