import type { FinanceResearchContext, FinanceResearchStatus } from "./finance-research";

export const FINANCE_PUBLICATION_KINDS = [
  "watchlist_collection",
  "symbol_thesis",
  "screen_rule",
  "trade_doctrine",
] as const;

export type FinancePublicationKind = (typeof FINANCE_PUBLICATION_KINDS)[number];

export interface FinancePublication {
  schemaVersion: 1;
  publicationKey: string;
  kind: FinancePublicationKind;
  status: FinanceResearchStatus | "revoked";
  title: string;
  symbols: string[];
  summary: string;
  reasons: string[];
  contradictions: string[];
  blockingGaps: string[];
  staleAfter?: string;
  publishedAt: string;
  revokedAt?: string;
}

const SYMBOL = /^[A-Z]{1,5}(?:\.[A-Z])?$/;

export function normalizeSymbols(input: unknown): string[] {
  const values = Array.isArray(input) ? input : String(input ?? "").split(/[\s,]+/);
  return [...new Set(values.map((value) => String(value).trim().toUpperCase()).filter((value) => SYMBOL.test(value)))];
}

export function publicationStatus(threadState: string): FinanceResearchStatus {
  if (threadState === "accepted") return "published";
  if (threadState === "review") return "provisional";
  return "working";
}

export function canPublishKind(kind: FinancePublicationKind, threadState: string): boolean {
  return !["screen_rule", "trade_doctrine"].includes(kind) || threadState === "accepted";
}

export function publicationToContext(
  publication: FinancePublication,
  source: { channelId: string; threadId: string; artifactId: string; version: number },
): FinanceResearchContext {
  return {
    id: `published:${publication.publicationKey}`,
    kind: publication.kind === "watchlist_collection"
      ? "theme"
      : publication.kind,
    title: publication.title,
    symbols: publication.symbols,
    status: publication.status === "revoked" ? "working" : publication.status,
    verdict: publication.status === "published" ? "confirmed" : "open",
    summary: publication.summary,
    reasons: publication.reasons,
    contradictions: publication.contradictions,
    blockingGaps: publication.blockingGaps,
    staleAfter: publication.staleAfter,
    collection: publication.kind === "watchlist_collection"
      ? publication.symbols.map((symbol) => ({ symbol, role: "Published research collection", notes: publication.summary }))
      : undefined,
    source: {
      channelId: source.channelId,
      threadId: source.threadId,
      objectType: "finance_publication",
      objectId: source.artifactId,
      version: source.version,
    },
  };
}
