"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const OPS_TABS = [
  { href: "/ops/fleet", label: "Fleet" },
  { href: "/ops/activity", label: "Activity" },
  { href: "/ops/runs", label: "Runs" },
  { href: "/ops/themes", label: "Themes" },
  { href: "/ops/registry", label: "Registry" },
  { href: "/ops/config", label: "Config" },
] as const;

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/ops";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 px-3 py-2 backdrop-blur pt-[env(safe-area-inset-top,0px)]">
        <div className="mb-1.5 flex items-baseline justify-between gap-2 px-1">
          <h1 className="text-sm font-semibold text-foreground">Ops</h1>
          <p className="text-[10px] text-muted-foreground">Fleet, activity, runs, config, themes</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted/60 p-0.5">
          {OPS_TABS.map((t) => {
            const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
            return (
              <Link
                key={t.href}
                href={t.href}
                prefetch={false}
                className={`flex-1 min-w-0 rounded-md px-0.5 py-1.5 text-center text-[11px] font-medium transition-colors ${
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
      {children}
    </div>
  );
}
