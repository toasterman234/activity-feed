import Link from "next/link";

export default function OpsIndex() {
  const links = [
    { href: "/ops/fleet", label: "Fleet", desc: "Agent fleet status and controls" },
    { href: "/ops/compute", label: "Compute", desc: "Nomad cluster — nodes, jobs, allocations" },
    { href: "/ops/activity", label: "Activity", desc: "Live agent activity feed" },
    { href: "/ops/runs", label: "Runs", desc: "Agent run history and metrics" },
    { href: "/ops/registry", label: "Registry", desc: "Tool registrations and subscriptions" },
    { href: "/ops/config", label: "Config", desc: "Models, workflows, notifications, perf" },
    { href: "/ops/themes", label: "Themes", desc: "Theme tester and design system preview" },
    { href: "/personal", label: "Finance", desc: "Portfolio, watchlist, screener, money flow" },
  ];

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-10 flex items-center border-b border-border bg-background/95 px-3 py-2 pt-[env(safe-area-inset-top,0px)] backdrop-blur">
        <h1 className="text-sm font-semibold text-foreground">Operations</h1>
      </header>
      <div className="mx-auto max-w-3xl space-y-2 px-3 py-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex flex-col rounded-lg border border-border bg-card px-3 py-2.5 hover:bg-muted/50"
          >
            <span className="text-sm font-medium text-foreground">{link.label}</span>
            <span className="text-[11px] text-muted-foreground">{link.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
