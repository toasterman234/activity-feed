"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Home" },
  { href: "/channels", label: "Channels" },
  { href: "/projects", label: "Projects" },
  { href: "/personal", label: "Finance" },
  { href: "/ops", label: "Ops" },
] as const;

export default function BottomNav() {
  const pathname = usePathname() || "/";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-10 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-5xl items-center px-2 py-1.5">
        {/* Pill bar — same look as shadcn TabsList variant=default */}
        <div className="flex w-full gap-0.5 rounded-lg bg-muted p-[3px]">
          {TABS.map((tab) => {
            const active =
              tab.href === "/"
                ? pathname === "/"
                : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                prefetch={false}
                className={cn(
                  "relative flex-1 rounded-md py-1.5 text-center text-[11px] sm:text-xs font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
