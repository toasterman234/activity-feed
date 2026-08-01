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
