export type FinanceResearchStatus = "working" | "provisional" | "published" | "stale";

export interface FinanceResearchContext {
  id: string;
  kind: "theme" | "symbol_thesis" | "screen_rule" | "trade_doctrine";
  title: string;
  symbols: string[];
  status: FinanceResearchStatus;
  verdict?: string;
  summary: string;
  reasons?: string[];
  contradictions?: string[];
  blockingGaps: string[];
  graphContext?: {
    activeDecisions: Array<{ id: string; statement: string; rationale?: string | null }>;
    acceptedMemory: Array<{ id: string; text: string; category: string }>;
  };
  staleAfter?: string;
  collection?: Array<{ symbol: string; role: string; notes: string }>;
  source: { channelId: string; threadId: string; objectType: string; objectId: string; version?: number };
}

export interface FinanceResearchSnapshot {
  version: number;
  generatedAt: string;
  quantChannelId: string;
  contexts: FinanceResearchContext[];
}

export async function getFinanceResearch(symbols?: string[]): Promise<FinanceResearchSnapshot> {
  const query = symbols?.length ? `?symbols=${encodeURIComponent(symbols.join(","))}` : "";
  const response = await fetch(`/api/finance/research-context${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Research context failed: ${response.status}`);
  return response.json();
}

export async function refreshFinanceSnapshot(): Promise<{ success: boolean; generatedAt: string; warnings: string[] }> {
  const response = await fetch("/api/finance/refresh-snapshot", { method: "POST" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Refresh failed: ${response.status}`);
  }
  return response.json();
}

export function researchThreadHref(context: FinanceResearchContext): string {
  if (!context.source.threadId) return "";
  return `/channels/${context.source.channelId}/${context.source.threadId}`;
}
