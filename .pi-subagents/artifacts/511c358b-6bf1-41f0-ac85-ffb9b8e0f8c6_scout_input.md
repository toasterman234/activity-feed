# Task for scout

Recon the activity-feed/dashboard codebase at /Users/bencharney/activity-feed/dashboard/src/ for a hedge-engine integration audit. Read-only. Focus on these areas and report findings with exact file paths and key types/fields:

1. **Electric Circuit shapes** (src/app/electric.ts) — document every shape (table name, what data it syncs), and find the schema definition (src/app/schema.ts or similar) — report the exact column names and types for: portfolio_positions, portfolio_trades, portfolio_balances, portfolio_transactions, portfolio_net_worth, portfolio_benchmarks, portfolio_allocation.

2. **Portfolio analytics library** (src/lib/portfolio-analytics/*) — read every file and document: function signatures, inputs, outputs, methodology for each module (types.ts, greek-aggregation.ts, income.ts, risk.ts, scenarios.ts, metric-card.ts). Note which calculations are already doing portfolio-level Greek aggregation, risk decomposition, stress testing, scenario grids, income analysis.

3. **Finance/page components** — read these files and document their data flow:
   - src/app/finance/portfolio-content.tsx
   - src/app/finance/analytics-content.tsx
   - src/app/finance/analytics-income.tsx
   - src/app/finance/analytics-risk.tsx
   - src/app/finance/personal-content.tsx (the tab container /personal page)
   - src/app/finance/trades-content.tsx
   - src/app/finance/watchlist-content.tsx
   - src/app/finance/screener-content.tsx
   - src/app/finance/money-flow-content.tsx
   - src/app/finance/net-worth-content.tsx
   - src/app/finance/banking-content.tsx
   - src/app/finance/option-chain-sheet.tsx
   - src/app/finance/candidate-inspection-sheet.tsx
   - src/app/finance/trade-lab-sheet.tsx
   - src/app/finance/candidate-compare.tsx

4. **Desktop finance pages** — read:
   - src/app/desktop/portfolio/page.tsx
   - src/app/desktop/sidebar.tsx
   - src/app/desktop/layout.tsx
   - src/app/desktop/research/page.tsx
   - src/app/desktop/screener/page.tsx
   - src/app/desktop/watchlist/page.tsx
   - src/app/desktop/analytics/page.tsx

5. **Market Lake client** — already read src/lib/market-lake.ts. Note all API endpoints, request/response types.

6. **Ingestion/backend** — look in dashboard/ingestion/ directory. Document what scripts/workers exist, what data they ingest, what databases they touch.

7. **Job/workflow infrastructure** — look for any workers, schedulers, Dagu configs, iii Harness references, cron jobs. Check:
   - dashboard/ops/
   - dashboard/package.json (scripts section)
   - Any .yml workflow files
   - Check if there's a separate backend service

8. **Deployment** — check next.config.ts, package.json build/deploy scripts, look for any docker/k8s config.

9. **Existing tests** — path and coverage for Playwright and Vitest tests related to portfolio/finance.

Report everything with exact file paths, function signatures, type shapes, and table schemas. This is for an audit report — be thorough.

---
**Output:**
Write your findings to exactly this path: /Users/bencharney/activity-feed/.pi-subagents/artifacts/outputs/511c358b-6bf1-41f0-ac85-ffb9b8e0f8c6/context.md
This path is authoritative for this run.
Ignore any other output filename or output path mentioned elsewhere, including output destinations in the base agent prompt, system prompt, or task instructions.

## Acceptance Contract
Acceptance level: attested
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Return concrete findings with file paths and severity when applicable

Required evidence: review-findings, residual-risks

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```