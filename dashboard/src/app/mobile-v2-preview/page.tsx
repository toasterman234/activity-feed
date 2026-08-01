import Link from "next/link";

type QueueItem = {
  title: string;
  meta: string;
  state: string;
  tone: "danger" | "warn" | "good" | "info";
};

const urgent: QueueItem[] = [
  { title: "Approve quant pipeline handoff", meta: "#research · review", state: "review", tone: "warn" },
  { title: "Agent runtime drift on ovh worker", meta: "#ops · failed gate", state: "failed", tone: "danger" },
  { title: "Mira dashboard mobile shell", meta: "#product · active", state: "active", tone: "good" },
  { title: "Reconcile repo → project mapping", meta: "#projects · blocked", state: "blocked", tone: "info" },
];

const channels = [
  { name: "research", unread: 7, pulse: "Need review on latest quant pipeline stage summary" },
  { name: "ops", unread: 3, pulse: "OVH build healthy, but one worker needs attention" },
  { name: "projects", unread: 2, pulse: "Promotion request waiting for repo verification" },
];

function toneClass(tone: QueueItem["tone"]) {
  switch (tone) {
    case "danger":
      return "bg-rose-500/15 text-rose-300 border-rose-400/20";
    case "warn":
      return "bg-amber-400/15 text-amber-200 border-amber-300/20";
    case "good":
      return "bg-emerald-400/15 text-emerald-200 border-emerald-300/20";
    default:
      return "bg-cyan-400/15 text-cyan-200 border-cyan-300/20";
  }
}

function PreviewFrame({ title, eyebrow, className, children }: { title: string; eyebrow: string; className: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-semibold text-zinc-100">{title}</h2>
      </div>
      <div className="rounded-[2rem] border border-white/10 bg-zinc-950/50 p-3 shadow-2xl shadow-black/30">
        <div className={`mx-auto min-h-[780px] max-w-[390px] overflow-hidden rounded-[1.6rem] border border-white/10 ${className}`}>
          {children}
        </div>
      </div>
    </section>
  );
}

function DenseOperatorMock() {
  return (
    <div className="min-h-full bg-[#0b0f17] px-4 pb-6 pt-5 text-zinc-100">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/80">Today</p>
          <h3 className="mt-2 text-3xl font-semibold tracking-tight">Command</h3>
          <p className="mt-1 text-xs text-zinc-400">4 urgent · 12 active · runtime healthy</p>
        </div>
        <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] text-emerald-200">live</div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        {[
          ["Unread", "12"],
          ["Needs", "4"],
          ["Active", "12"],
          ["Fail", "1"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/6 bg-white/[0.04] p-3">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
            <div className="mt-1 text-lg font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-3xl border border-cyan-400/10 bg-cyan-400/[0.07] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-200/80">Primary focus</p>
            <p className="mt-2 text-lg font-semibold leading-tight">Approve quant pipeline handoff before agent loop stalls</p>
            <p className="mt-2 text-sm text-zinc-300">#research · review gate waiting · last update 8m ago</p>
          </div>
          <div className="h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_24px_rgba(103,232,249,0.9)]" />
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-white/8 bg-white/[0.04] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-medium">Urgent queue</h4>
          <span className="text-[11px] text-zinc-500">top 4</span>
        </div>
        <div className="space-y-2.5">
          {urgent.map((item) => (
            <div key={item.title} className="rounded-2xl border border-white/6 bg-black/20 px-3 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium leading-tight">{item.title}</p>
                  <p className="mt-1 text-xs text-zinc-400">{item.meta}</p>
                </div>
                <span className={`rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${toneClass(item.tone)}`}>
                  {item.state}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-white/8 bg-white/[0.04] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-medium">Unread channels</h4>
          <span className="text-[11px] text-zinc-500">3 hot</span>
        </div>
        <div className="space-y-2">
          {channels.map((channel) => (
            <div key={channel.name} className="rounded-2xl bg-black/20 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">#{channel.name}</p>
                <span className="rounded-full bg-cyan-400/15 px-2 py-1 text-[10px] text-cyan-200">{channel.unread} unread</span>
              </div>
              <p className="mt-1 text-xs text-zinc-400">{channel.pulse}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PremiumDarkMock() {
  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,#18304f_0%,#0b1221_36%,#080a11_100%)] px-4 pb-6 pt-5 text-zinc-50">
      <div className="rounded-[1.8rem] border border-white/10 bg-white/[0.045] p-4 backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.32em] text-cyan-200/75">Operator view</p>
            <h3 className="mt-2 text-[2rem] font-semibold tracking-tight">Today</h3>
            <p className="mt-1 text-sm text-zinc-300/80">A calmer command layer over the same system.</p>
          </div>
          <div className="rounded-full bg-white/10 px-3 py-1 text-[11px] text-zinc-200">11:42</div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-[1.4rem] border border-white/8 bg-black/20 p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">Priority</p>
            <p className="mt-2 text-xl font-semibold leading-tight">Quant handoff needs approval</p>
            <p className="mt-2 text-sm text-zinc-400">Review gate waiting in #research</p>
          </div>
          <div className="rounded-[1.4rem] border border-cyan-300/10 bg-cyan-300/[0.06] p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-100/75">Runtime</p>
            <p className="mt-2 text-xl font-semibold">Stable</p>
            <p className="mt-2 text-sm text-zinc-300">Pi available · work-runs fresh</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {[
          ["Unread", "12"],
          ["Needs", "4"],
          ["Projects", "8"],
          ["Fail", "1"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/8 bg-white/[0.045] p-3 text-center backdrop-blur-sm">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
            <div className="mt-1 text-lg font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {urgent.slice(0, 3).map((item, index) => (
          <div key={item.title} className="rounded-[1.5rem] border border-white/8 bg-white/[0.045] p-4 backdrop-blur-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-3">
                <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[11px] text-zinc-300">0{index + 1}</div>
                <div>
                  <p className="text-sm font-medium leading-tight">{item.title}</p>
                  <p className="mt-1 text-xs text-zinc-400">{item.meta}</p>
                </div>
              </div>
              <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide ${toneClass(item.tone)}`}>{item.state}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-[1.8rem] border border-white/8 bg-white/[0.04] p-4 backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-medium">Signals</h4>
          <span className="text-[11px] text-zinc-500">fresh</span>
        </div>
        <div className="space-y-2.5">
          {channels.map((channel) => (
            <div key={channel.name} className="rounded-2xl border border-white/6 bg-black/15 px-3 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">#{channel.name}</p>
                <p className="text-[11px] text-zinc-500">{channel.unread} unread</p>
              </div>
              <p className="mt-1 text-xs text-zinc-400">{channel.pulse}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NeutralExecMock() {
  return (
    <div className="min-h-full bg-[#f4f6f8] px-4 pb-6 pt-5 text-[#111827]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Today</p>
          <h3 className="mt-2 text-[2rem] font-semibold tracking-tight">Command Center</h3>
          <p className="mt-1 text-sm text-slate-500">Clearer, flatter, more operationally neutral.</p>
        </div>
        <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-600 shadow-sm">updated now</div>
      </div>

      <div className="mt-4 rounded-[1.8rem] border border-slate-200 bg-white p-4 shadow-[0_20px_45px_rgba(15,23,42,0.06)]">
        <div className="grid grid-cols-4 gap-2">
          {[
            ["Unread", "12"],
            ["Needs", "4"],
            ["Active", "12"],
            ["Failed", "1"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-slate-50 p-3 text-center">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-[1.3rem] border border-slate-200 bg-slate-50 p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Focus now</p>
          <p className="mt-2 text-lg font-semibold leading-tight text-slate-900">Approve quant pipeline handoff before queue drift increases</p>
          <p className="mt-2 text-sm text-slate-600">#research · review gate · 8m ago</p>
        </div>
      </div>

      <div className="mt-4 rounded-[1.8rem] border border-slate-200 bg-white p-4 shadow-[0_20px_45px_rgba(15,23,42,0.06)]">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-900">Urgent Queue</h4>
          <span className="text-[11px] text-slate-500">ordered by attention</span>
        </div>
        <div className="space-y-2.5">
          {urgent.map((item) => (
            <div key={item.title} className="rounded-[1.2rem] border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{item.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.meta}</p>
                </div>
                <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide ${toneClass(item.tone)}`}>{item.state}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-[1.8rem] border border-slate-200 bg-white p-4 shadow-[0_20px_45px_rgba(15,23,42,0.06)]">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-900">Channel Pressure</h4>
          <span className="text-[11px] text-slate-500">where to look next</span>
        </div>
        <div className="space-y-2.5">
          {channels.map((channel) => (
            <div key={channel.name} className="rounded-[1.2rem] bg-slate-50 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-900">#{channel.name}</p>
                <span className="rounded-full bg-slate-200 px-2 py-1 text-[10px] text-slate-700">{channel.unread} unread</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{channel.pulse}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MobileV2PreviewPage() {
  return (
    <main className="min-h-screen bg-[#09090b] px-4 py-8 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/80">Preview only</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">mobile-v2 visual directions</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">Three separate Today-screen concepts for the new command-center surface. New UI only. Existing production routes remain untouched.</p>
          </div>
          <div className="flex gap-2 text-sm">
            <Link href="/mobile" className="rounded-full border border-white/10 px-4 py-2 text-zinc-300 hover:bg-white/5">Current mobile scaffold</Link>
            <Link href="/" className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-cyan-200 hover:bg-cyan-300/15">Main app</Link>
          </div>
        </div>

        <div className="grid gap-10 xl:grid-cols-3">
          <PreviewFrame eyebrow="Direction 01" title="Dense operator" className="bg-[#0b0f17]">
            <DenseOperatorMock />
          </PreviewFrame>
          <PreviewFrame eyebrow="Direction 02" title="Premium dark" className="bg-[#080a11]">
            <PremiumDarkMock />
          </PreviewFrame>
          <PreviewFrame eyebrow="Direction 03" title="Neutral executive" className="bg-[#f4f6f8]">
            <NeutralExecMock />
          </PreviewFrame>
        </div>
      </div>
    </main>
  );
}
