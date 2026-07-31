"use client";

import Link from "next/link";
import { PageShell } from "@/components/ui";
import { TududiPlanningPanel } from "./TududiPlanningPanel";

export default function ProjectsPage() {
  return (
    <PageShell maxWidth="max-w-6xl" className="pb-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Projects</h1>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Tududi projects are the spine. Linked repos appear under a project when attached.
          </p>
        </div>
        <Link href="/channels" className="text-xs font-medium text-primary hover:underline">
          Channels
        </Link>
      </div>

      <TududiPlanningPanel />
    </PageShell>
  );
}
