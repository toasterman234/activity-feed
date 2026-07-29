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
    <div className="min-h-screen bg-zinc-50 pb-16 dark:bg-zinc-950">
      <header className="sticky top-0 z-10 flex items-center border-b border-zinc-200 bg-white/95 px-3 py-2 pt-[env(safe-area-inset-top,0px)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Operations</h1>
      </header>
      <div className="mx-auto max-w-3xl space-y-2 px-3 py-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex flex-col rounded-lg border border-zinc-200 bg-white px-3 py-2.5 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{link.label}</span>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{link.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
