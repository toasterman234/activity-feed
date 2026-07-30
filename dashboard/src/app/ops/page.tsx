"use client";

import { Suspense } from "react";
import FleetPage from "@/app/fleet/FleetPage";
import ActivityPage from "@/app/activity/ActivityPage";
import RunsPage from "@/app/runs/RunsPage";
import RegistryPanel from "@/app/fleet/RegistryPanel";
import OpsConfigPage from "./config/page";
import ThemesPage from "./themes/page";

const SECTIONS = [
  { id: "fleet", label: "Fleet" },
  { id: "activity", label: "Activity" },
  { id: "runs", label: "Runs" },
  { id: "registry", label: "Registry" },
  { id: "config", label: "Config" },
  { id: "themes", label: "Themes" },
] as const;

export default function OpsPage() {
  return (
    <div className="bg-background pb-16">
      {/* Jump bar */}
      <nav className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur px-2 py-1.5 pt-[env(safe-area-inset-top,0px)]">
        <div className="flex gap-1 rounded-lg bg-muted/60 p-0.5 max-w-5xl mx-auto">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() =>
                document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth" })
              }
              className="flex-1 min-w-0 rounded-md px-0.5 py-1.5 text-center text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {s.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Fleet */}
      <section id="fleet">
        <FleetPage />
      </section>

      {/* Activity */}
      <section id="activity">
        <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading activity…</div>}>
          <ActivityPage />
        </Suspense>
      </section>

      {/* Runs */}
      <section id="runs">
        <RunsPage />
      </section>

      {/* Registry */}
      <section id="registry">
        <div className="mx-auto max-w-5xl px-3 py-3">
          <h2 className="text-base font-bold text-foreground mb-3">Registry</h2>
          <RegistryPanel />
        </div>
      </section>

      {/* Config */}
      <section id="config">
        <OpsConfigPage />
      </section>

      {/* Themes */}
      <section id="themes">
        <ThemesPage />
      </section>
    </div>
  );
}
