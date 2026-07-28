"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/channels/continuity", label: "Initiatives", match: (p: string) => p === "/channels/continuity" || /^\/channels\/continuity\/[^/]+$/.test(p) },
  { href: "/channels/continuity/inbox", label: "Inbox", match: (p: string) => p.startsWith("/channels/continuity/inbox") },
] as const;

export default function ContinuityLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";

  return (
    <div className="mx-auto max-w-5xl px-4 pt-4">
      <header className="mb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Continuity</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Initiatives (evidence + promote) and graph inbox gates — one place.
            </p>
          </div>
          <Link href="/channels" className="text-[11px] text-zinc-500 underline">
            ← Channels
          </Link>
        </div>
      </header>

      <div className="mb-3 flex gap-1 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-900">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              prefetch={false}
              className={`flex-1 min-w-0 rounded-md px-0.5 py-1.5 text-center text-[11px] font-medium transition-colors ${
                active
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
