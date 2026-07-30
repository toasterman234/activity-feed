import Link from "next/link";

export default function OpsIndex() {
  const links = [
    { href: "/personal", label: "Personal", desc: "Your tasks, docs, and personal workspace" },
    { href: "/finance", label: "Finance", desc: "Financial tracking and reports" },
    { href: "/ops/fleet", label: "Fleet", desc: "Agent fleet status and run management" },
    { href: "/ops/config", label: "Models & Config", desc: "Model status, API keys, and runtime settings" },
    { href: "/ops/registry", label: "Registry", desc: "Tool registrations and subscriptions" },
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
