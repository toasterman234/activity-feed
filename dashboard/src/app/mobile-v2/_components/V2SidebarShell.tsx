"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookOpen,
  FolderKanban,
  Home,
  Inbox,
  Landmark,
  Menu,
  Rocket,
  Settings,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const PRIMARY = [
  { href: "/mobile-v2", label: "Today", icon: Home },
  { href: "/mobile-v2/inbox", label: "Inbox", icon: Inbox },
  { href: "/mobile-v2/projects", label: "Projects", icon: FolderKanban },
  { href: "/mobile-v2/finance", label: "Finance", icon: Landmark },
  { href: "/mobile-v2/ops", label: "Ops", icon: Wrench },
] as const;

const BUILDING = [
  { href: "/mobile-v2/fleet", label: "Fleet", icon: Rocket },
  { href: "/mobile-v2/registry", label: "Registry", icon: BookOpen },
  { href: "/mobile-v2/runs", label: "Runs", icon: Bell },
  { href: "/mobile-v2/config", label: "Config", icon: Settings },
] as const;

function NavButton({
  href,
  label,
  icon: Icon,
  pathname,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: any;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition",
        active
          ? "border-[#111318] bg-white text-[#111318] shadow-[0_0_0_1px_rgba(17,19,24,0.03),0_8px_20px_rgba(17,19,24,0.08)]"
          : "border-transparent text-[var(--sidebar-foreground)] hover:border-[var(--border)] hover:bg-white"
      )}
    >
      <Icon className={cn("size-4", active && "text-[#111318]")} />
      <span className="font-medium">{label}</span>
    </Link>
  );
}

function SidebarBody({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-[var(--sidebar)]">
      <div className="border-b border-[var(--sidebar-border)] p-4">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--sidebar-border)] bg-white px-3 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-[#111318] text-white"><Sparkles className="size-4" /></div>
            <div>
              <div className="text-sm font-semibold text-[var(--foreground)]">Acme Inc</div>
              <div className="text-xs text-[var(--muted-foreground)]">Azure Mono v2</div>
            </div>
          </div>
          <div className="text-xs text-[var(--muted-foreground)]">⌄</div>
        </div>
      </div>

      <div className="p-3">
        <div className="mb-2 px-2 text-xs text-[var(--muted-foreground)]">Platform</div>
        <div className="space-y-1">
          {PRIMARY.map((item) => <NavButton key={item.href} {...item} pathname={pathname} onNavigate={onNavigate} />)}
        </div>
      </div>

      <div className="border-t border-[var(--sidebar-border)] p-3">
        <div className="mb-2 px-2 text-xs text-[var(--muted-foreground)]">Building next</div>
        <div className="space-y-1">
          {BUILDING.map((item) => <NavButton key={item.href} {...item} pathname={pathname} onNavigate={onNavigate} />)}
        </div>
      </div>

      <div className="mt-auto border-t border-[var(--sidebar-border)] p-4">
        <div className="flex items-center justify-between rounded-2xl border border-[var(--sidebar-border)] bg-white px-3 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--primary)_18%,white)] text-[var(--primary)]">BC</div>
            <div>
              <div className="text-sm font-medium text-[var(--foreground)]">Ben</div>
              <div className="text-xs text-[var(--muted-foreground)]">dashboard operator</div>
            </div>
          </div>
          <div className="text-xs text-[var(--muted-foreground)]">⌃</div>
        </div>
      </div>
    </div>
  );
}

export default function V2SidebarShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/mobile-v2";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    document.body.classList.add("mobile-v2-active");

    const root = document.documentElement;
    const hadThemeOverride = root.hasAttribute("data-theme") || !!root.getAttribute("style");
    let shouldReload = false;

    try {
      if (sessionStorage.getItem("__proto_theme")) {
        sessionStorage.removeItem("__proto_theme");
        shouldReload = true;
      }
      if (localStorage.getItem("data-theme")) {
        localStorage.removeItem("data-theme");
        shouldReload = true;
      }
    } catch {}

    if (hadThemeOverride) {
      root.removeAttribute("data-theme");
      root.removeAttribute("style");
      shouldReload = true;
    }

    void (async () => {
      try {
        const registrations = await navigator.serviceWorker?.getRegistrations?.();
        if (registrations?.length) {
          await Promise.all(registrations.map((registration) => registration.unregister()));
          shouldReload = true;
        }
      } catch {}

      try {
        const keys = await caches.keys();
        if (keys.length) {
          await Promise.all(keys.map((key) => caches.delete(key)));
          shouldReload = true;
        }
      } catch {}

      try {
        const marker = "__mobile_v2_cache_reset_done";
        if (shouldReload && sessionStorage.getItem(marker) !== "1") {
          sessionStorage.setItem(marker, "1");
          window.location.reload();
          return;
        }
        sessionStorage.removeItem(marker);
      } catch {}
    })();

    return () => document.body.classList.remove("mobile-v2-active");
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return (
    <div className="mobile-v2-theme app-shell min-h-[100dvh] bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto flex min-h-[100dvh] max-w-[1600px]">
        {isDesktop ? (
          <aside className="w-[270px] shrink-0 border-r border-[var(--sidebar-border)]">
            <SidebarBody pathname={pathname} />
          </aside>
        ) : null}

        <div className="min-w-0 flex-1">
          {!isDesktop ? (
            <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--background)]/95 px-4 py-3 backdrop-blur-sm">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger render={<Button variant="outline" size="icon-sm" />}>
                  <Menu className="size-4" />
                </SheetTrigger>
                <SheetContent side="left" className="w-[290px] p-0">
                  <SidebarBody pathname={pathname} onNavigate={() => setMobileOpen(false)} />
                </SheetContent>
              </Sheet>
              <div>
                <div className="text-sm font-semibold text-[var(--foreground)]">mobile-v2</div>
                <div className="text-xs text-[var(--muted-foreground)]">isolated route family</div>
              </div>
            </header>
          ) : null}
          <main className="page-content px-3 py-3 lg:px-5 lg:py-5">{children}</main>
        </div>
      </div>
    </div>
  );
}
