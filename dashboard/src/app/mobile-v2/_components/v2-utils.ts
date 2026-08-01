export function formatRelative(input?: string | null): string {
  if (!input) return "—";
  const date = new Date(input);
  const diff = Date.now() - date.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

export function compactCount(value: number): string {
  if (value > 999) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

export function statusTone(state?: string | null): string {
  const s = (state || "").toLowerCase();
  if (["failed", "fail", "blocked"].includes(s)) return "text-[var(--destructive)] bg-[color-mix(in_srgb,var(--destructive)_10%,white)] border-[color-mix(in_srgb,var(--destructive)_24%,white)]";
  if (["review", "wait"].includes(s)) return "text-amber-700 bg-amber-50 border-amber-200";
  if (["active", "running", "in_progress"].includes(s)) return "text-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,white)] border-[color-mix(in_srgb,var(--primary)_24%,white)]";
  return "text-emerald-700 bg-emerald-50 border-emerald-200";
}
