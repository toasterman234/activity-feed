---
type: Web UI
title: Pages and Components
description: Page routes, electric-circuits shape definitions, and Market Lake API client for the dashboard.
tags: [web-ui, pages, components, electric-circuits, api-client]
---

# Pages and Components

The dashboard is a Next.js 16 App Router application with six routes, typed electric-circuits shapes, and a Market Lake API client.

## Page Routes

| Route | Page | Data Source | Description |
|---|---|---|---|
| `/` | Activity feed | electric-circuits | Live streaming activity log, 9,400+ rows |
| `/portfolio` | Portfolio dashboard | electric-circuits | Net worth, allocation bar, positions table |
| `/watchlist` | Live watchlist | Market Lake API | Add/remove symbols, real-time quotes |
| `/trades` | Trade history | electric-circuits | 5,400+ trades, paginated with subset queries |
| `/research` | Research browser | Market Lake API | Strategy cards, findings table |
| `/screener` | VRP scanner | Market Lake API | Volatility risk premium scan, IV rank filter |

**File layout:**
```
src/
  app/
    page.tsx              — Activity feed (root)
    layout.tsx            — Nav bar with 6 tabs
    electric.ts           — Shape definitions
    schema.ts             — Typed column definitions
    globals.css           — Tailwind styles
    portfolio/
      page.tsx
    watchlist/
      page.tsx
    trades/
      page.tsx
    research/
      page.tsx
    screener/
      page.tsx
  lib/
    market-lake.ts        — API client for :9077
```

## Electric-Circuits Shapes

**File:** `src/app/electric.ts`

Each table has a shape definition consumed by the page component:

```typescript
const SHAPES = {
  activity_log: { table: "activity_log" },
  portfolio_positions: { table: "portfolio_positions" },
  portfolio_trades: { table: "portfolio_trades" },
  portfolio_balances: { table: "portfolio_balances" },
  portfolio_net_worth: { table: "portfolio_net_worth" },
  portfolio_benchmarks: { table: "portfolio_benchmarks" },
  portfolio_allocation: { table: "portfolio_allocation" },
} satisfies Record<string, ShapeDef>;

export function getActivityShape() {
  return client.shape(SHAPES["activity_log"]);
}
// ... one getter per table
```

**Pattern in pages:**
```typescript
const [shape, setShape] = useState<ShapeMaterialization<TableRow> | null>(null);

useEffect(() => {
  getPositionsShape().then(setShape);
}, []);

if (!shape) return <div>Connecting…</div>;

const rows = useLiveQuery(shape.collection);
```

## Market Lake API Client

**File:** `src/lib/market-lake.ts`

Typed fetch wrapper for Market Lake API at `:9077`. Used by watchlist, research, and screener pages:

```typescript
const API_BASE = process.env.NODE_ENV === "development"
  ? "http://localhost:9077"
  : "https://bens-mac-mini.taila1553c.ts.net"; // Tailscale Funnel

export async function getQuotes(symbols: string[]): Promise<Quote[]> { ... }
export async function getVRPScan(params): Promise<VRPScanResult[]> { ... }
export async function getResearchFindings(): Promise<Finding[]> { ... }
export async function getResearchStrategies(): Promise<Strategy[]> { ... }
```

## Navigation

The nav bar in `layout.tsx` links all six routes and highlights the active page:

```tsx
<nav>
  <Link href="/">Feed</Link>
  <Link href="/portfolio">Portfolio</Link>
  <Link href="/watchlist">Watchlist</Link>
  <Link href="/trades">Trades</Link>
  <Link href="/research">Research</Link>
  <Link href="/screener">Screener</Link>
</nav>
```

## PWA Manifest

**File:** `public/manifest.json`

```json
{
  "name": "Activity Feed",
  "short_name": "Feed",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a"
}
```
