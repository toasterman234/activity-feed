import Link from "next/link";

type QueueItem = {
  title: string;
  meta: string;
  state: string;
  tone: "danger" | "warn" | "good" | "info";
};

const urgent: QueueItem[] = [
  { title: "Approve quant pipeline handoff", meta: "#research · review gate", state: "review", tone: "warn" },
  { title: "Agent runtime drift on ovh worker", meta: "#ops · failed gate", state: "failed", tone: "danger" },
  { title: "Mira dashboard mobile shell", meta: "#product · active", state: "active", tone: "good" },
  { title: "Reconcile repo → project mapping", meta: "#projects · blocked", state: "blocked", tone: "info" },
];

const channels = [
  { name: "research", unread: 7, pulse: "Need review on latest quant pipeline stage summary" },
  { name: "ops", unread: 3, pulse: "OVH build healthy, but one worker needs attention" },
  { name: "projects", unread: 2, pulse: "Promotion request waiting for repo verification" },
];

function tonePill(tone: QueueItem["tone"]) {
  switch (tone) {
    case "danger":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "warn":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "good":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    default:
      return "border-sky-200 bg-sky-50 text-sky-700";
  }
}

function darkTonePill(tone: QueueItem["tone"]) {
  switch (tone) {
    case "danger":
      return "border-rose-400/20 bg-rose-500/10 text-rose-200";
    case "warn":
      return "border-amber-400/20 bg-amber-400/10 text-amber-200";
    case "good":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
    default:
      return "border-cyan-400/20 bg-cyan-400/10 text-cyan-200";
  }
}

function Frame({ title, eyebrow, note, children }: { title: string; eyebrow: string; note: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-semibold text-zinc-100">{title}</h2>
        <p className="mt-1 text-sm text-zinc-400">{note}</p>
      </div>
      <div className="rounded-[2rem] border border-white/10 bg-zinc-950/40 p-3 shadow-2xl shadow-black/30">
        <div className="mx-auto min-h-[780px] max-w-[390px] overflow-hidden rounded-[1.6rem] border border-white/10 bg-black/20">{children}</div>
      </div>
    </section>
  );
}

function RefinedUtility() {
  return (
    <div className="min-h-full bg-[#f6f8fb] px-4 pb-24 pt-5 text-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">Today</p>
          <h3 className="mt-2 text-[2rem] font-semibold tracking-tight">Command center</h3>
          <p className="mt-1 text-sm text-slate-500">Refined utility inspired by 21st stat cards.</p>
        </div>
        <button className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-600 shadow-sm">Refresh</button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {[
          ["Unread", "12", "+3 since last check"],
          ["Needs me", "4", "review / blocked / fail"],
          ["Active", "12", "threads in progress"],
          ["Failed", "1", "promotion issue open"],
        ].map(([label, value, hint]) => (
          <div key={label} className="rounded-[1.4rem] border border-slate-200 bg-white p-4 shadow-[0_14px_30px_rgba(15,23,42,0.06)]">
            <div className="text-[11px] font-medium text-slate-500">{label}</div>
            <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</div>
            <div className="mt-2 text-xs text-slate-500">{hint}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-[0_14px_30px_rgba(15,23,42,0.06)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Primary focus</p>
            <h4 className="mt-2 text-lg font-semibold leading-tight">Approve quant pipeline handoff before queue drift increases</h4>
            <p className="mt-2 text-sm text-slate-500">#research · review gate · last update 8m ago</p>
          </div>
          <div className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </div>
      </div>

      <div className="mt-4 rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-[0_14px_30px_rgba(15,23,42,0.06)]">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold">Urgent queue</h4>
          <span className="text-[11px] text-slate-500">ordered by attention</span>
        </div>
        <div className="space-y-2.5">
          {urgent.map((item) => (
            <div key={item.title} className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{item.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.meta}</p>
                </div>
                <span className={`rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${tonePill(item.tone)}`}>{item.state}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="fixed bottom-4 left-1/2 z-20 w-[calc(100%-2rem)] max-w-[360px] -translate-x-1/2 rounded-full border border-slate-200 bg-white p-2 shadow-[0_16px_40px_rgba(15,23,42,0.12)]">
        <div className="flex items-center gap-1 text-[11px] font-medium">
          {[
            ["Today", true],
            ["Inbox", false],
            ["Projects", false],
            ["Ops", false],
          ].map(([label, active]) => (
            <div key={String(label)} className={`flex-1 rounded-full px-3 py-2 text-center ${active ? "bg-slate-900 text-white" : "text-slate-500"}`}>{label}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function QuietCommand() {
  return (
    <div className="min-h-full bg-[#0d1117] px-4 pb-24 pt-5 text-zinc-100">
      <div className="rounded-[1.8rem] border border-white/10 bg-white/[0.045] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-zinc-500">Today</p>
            <h3 className="mt-2 text-[2rem] font-semibold tracking-tight">Operator</h3>
            <p className="mt-1 text-sm text-zinc-400">Quiet command style using softer nav and card language.</p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-zinc-300">stable</div>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-2">
          {[
            ["Unread", "12"],
            ["Needs", "4"],
            ["Active", "12"],
            ["Fail", "1"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-white/8 bg-black/20 p-3 text-center">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
              <div className="mt-1 text-lg font-semibold">{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {urgent.map((item, index) => (
          <div key={item.title} className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 shadow-[0_12px_30px_rgba(0,0,0,0.16)]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[11px] text-zinc-300">0{index + 1}</div>
                <div>
                  <p className="text-sm font-medium leading-tight">{item.title}</p>
                  <p className="mt-1 text-xs text-zinc-400">{item.meta}</p>
                </div>
              </div>
              <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide ${darkTonePill(item.tone)}`}>{item.state}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-4 shadow-[0_12px_30px_rgba(0,0,0,0.16)]">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-medium">Unread channels</h4>
          <span className="text-[11px] text-zinc-500">pressure map</span>
        </div>
        <div className="space-y-2.5">
          {channels.map((channel) => (
            <div key={channel.name} className="rounded-2xl border border-white/8 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">#{channel.name}</p>
                <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[10px] text-cyan-200">{channel.unread} unread</span>
              </div>
              <p className="mt-1 text-xs text-zinc-400">{channel.pulse}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="fixed bottom-4 left-1/2 z-20 w-[calc(100%-2rem)] max-w-[360px] -translate-x-1/2 rounded-full border border-white/10 bg-zinc-950/90 p-2 shadow-[0_20px_50px_rgba(0,0,0,0.38)] backdrop-blur-xl">
        <div className="flex items-center gap-1 text-[11px] font-medium">
          {[
            ["Today", true],
            ["Inbox", false],
            ["Projects", false],
            ["Ops", false],
          ].map(([label, active]) => (
            <div key={String(label)} className={`flex-1 rounded-full px-3 py-2 text-center transition ${active ? "bg-cyan-400 text-zinc-950" : "text-zinc-400"}`}>{label}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CompactEditorial() {
  return (
    <div className="min-h-full bg-[#f3efe7] px-4 pb-24 pt-5 text-[#171717]">
      <div className="flex items-start justify-between gap-3 border-b border-[#171717]/10 pb-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[#171717]/55">Today</p>
          <h3 className="mt-2 text-[2rem] font-semibold tracking-tight">Desk</h3>
          <p className="mt-1 text-sm text-[#171717]/60">Editorial operator treatment using stricter hierarchy.</p>
        </div>
        <button className="rounded-full border border-[#171717]/10 bg-white/70 px-3 py-1.5 text-[11px] text-[#171717]/70">Sync</button>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 border-b border-[#171717]/10 pb-4 text-center">
        {[
          ["Unread", "12"],
          ["Needs", "4"],
          ["Active", "12"],
          ["Fail", "1"],
        ].map(([label, value]) => (
          <div key={label}>
            <div className="text-[10px] uppercase tracking-wide text-[#171717]/45">{label}</div>
            <div className="mt-1 text-lg font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#171717]/45">Primary focus</p>
          <h4 className="mt-2 text-xl font-semibold leading-tight">Approve quant pipeline handoff before queue drift increases</h4>
          <p className="mt-2 text-sm text-[#171717]/60">#research · review gate · 8m ago</p>
        </div>

        <div className="space-y-0 border-y border-[#171717]/10">
          {urgent.map((item) => (
            <div key={item.title} className="flex items-start justify-between gap-3 border-b border-[#171717]/10 py-3 last:border-b-0">
              <div>
                <p className="text-sm font-medium">{item.title}</p>
                <p className="mt-1 text-xs text-[#171717]/55">{item.meta}</p>
              </div>
              <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide ${tonePill(item.tone)}`}>{item.state}</span>
            </div>
          ))}
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#171717]/45">Channel pressure</p>
          <div className="mt-3 space-y-3">
            {channels.map((channel) => (
              <div key={channel.name} className="border-b border-[#171717]/10 pb-3 last:border-b-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">#{channel.name}</p>
                  <span className="text-[11px] text-[#171717]/55">{channel.unread} unread</span>
                </div>
                <p className="mt-1 text-xs text-[#171717]/55">{channel.pulse}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="fixed bottom-4 left-1/2 z-20 w-[calc(100%-2rem)] max-w-[360px] -translate-x-1/2 rounded-full border border-[#171717]/10 bg-[#fffdf9]/90 p-2 shadow-[0_16px_40px_rgba(0,0,0,0.1)] backdrop-blur-xl">
        <div className="flex items-center gap-1 text-[11px] font-medium text-[#171717]/55">
          {[
            ["Today", true],
            ["Inbox", false],
            ["Projects", false],
            ["Ops", false],
          ].map(([label, active]) => (
            <div key={String(label)} className={`flex-1 rounded-full px-3 py-2 text-center ${active ? "bg-[#171717] text-[#fffdf9]" : ""}`}>{label}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MobileV2Preview21stPage() {
  return (
    <main className="min-h-screen bg-[#09090b] px-4 py-8 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/80">21st-guided</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">dense operator, re-skinned</h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-400">Same command-center structure, rebuilt with better UI direction using 21st.dev inspiration: stat cards, cleaner bottom nav treatment, and quieter command-surface patterns.</p>
          </div>
          <div className="flex gap-2 text-sm">
            <Link href="/mobile-v2-preview" className="rounded-full border border-white/10 px-4 py-2 text-zinc-300 hover:bg-white/5">First 3 mocks</Link>
            <Link href="/mobile" className="rounded-full border border-white/10 px-4 py-2 text-zinc-300 hover:bg-white/5">Current scaffold</Link>
          </div>
        </div>

        <div className="grid gap-10 xl:grid-cols-3">
          <Frame eyebrow="Direction A" title="Refined utility" note="Closest to shadcn/21st stat-card language. Cleaner and more production-like.">
            <RefinedUtility />
          </Frame>
          <Frame eyebrow="Direction B" title="Quiet command" note="Uses the bottom-nav inspiration more directly. Better if you still want a dark operator surface.">
            <QuietCommand />
          </Frame>
          <Frame eyebrow="Direction C" title="Compact editorial" note="Less app-chrome, more hierarchy. Good if you want this to feel designed, not dashboard-generic.">
            <CompactEditorial />
          </Frame>
        </div>
      </div>
    </main>
  );
}
