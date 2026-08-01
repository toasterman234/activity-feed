"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/mobile", label: "Home" },
  { href: "/mobile/channels", label: "Channels" },
  { href: "/mobile/projects", label: "Projects" },
] as const;

export default function MobileNav() {
  const pathname = usePathname() || "/mobile";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/10 bg-zinc-950/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
      <div className="mx-auto flex max-w-md gap-2 rounded-2xl border border-white/10 bg-white/5 p-1.5 shadow-[0_-10px_40px_rgba(0,0,0,0.25)]">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch={false}
              className={[
                "flex-1 rounded-xl px-3 py-2 text-center text-[11px] font-medium transition",
                active
                  ? "bg-cyan-400 text-zinc-950 shadow-[0_8px_24px_rgba(34,211,238,0.35)]"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100",
              ].join(" ")}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
