# Finance API

Live endpoints under `/api/finance/`. The Finance tab (Watchlist, Screener, Trade Lab)
reads live Public.com data through Electric shapes; publication and context routes
connect Quant research threads to Finance views.

## `GET /api/finance/research-context`

Merges:
1. A pre-exported research snapshot (`data/finance-research.snapshot.json`) — built
   at deploy time by `scripts/export-finance-research-snapshot.mjs`.
2. Live publication artifacts from the `thread_artifacts` table (kind `finance_publication`,
   status `active`).

Returns all resolved contexts used by Watchlist badges, Screener candidate inspection,
and Trade Lab prefill. Includes linked Continuity Graph decisions and agentmemory items.

No query parameters. No authentication required (PWA is single-user).

## `POST /api/finance/publications`

Publishes research artifacts from a thread to the Finance tab. Idempotent (creates or
updates a versioned artifact per publication key).

### Request body

```json
{
  "threadId": "<thread uuid>",
  "action": "publish | revoke",
  "kind": "watchlist_collection | symbol_thesis | screener_rule | trade_lab_doctrine",
  "publicationKey": "<threadId>:<kind> (default, or custom for multiple publications per kind)"
}
```

### Governance

- Only **Research lifecycle** threads (`lifecycle = 'research'`) can publish.
- **Working** or **Review** threads can publish draft artifacts.
- **Approved** threads can publish finalized artifacts.
- **Revocation** sets status to `revoked` — hidden from Finance, but history is preserved.
- Each publish creates a new artifact version; revisions are idempotent within a
  publication key.

### Response

```json
{
  "success": true,
  "publication": {
    "id": "<artifact uuid>",
    "threadId": "<thread uuid>",
    "publicationKey": "<threadId>:<kind>",
    "kind": "symbol_thesis",
    "status": "active",
    "version": 2
  }
}
```

### Errors

| Status | Condition |
|--------|-----------|
| 409 | Thread is not Research lifecycle |
| 422 | Missing threadId or invalid publication kind |

## Data layer

### Watchlist & Screener live data

Both tabs read live Public.com data through Electric shapes (via
`@electric-sql/client`). No REST endpoints — the client opens live sync
streams against the Electric service on OVH.

- Watchlist: 15-second refresh cycle via Electric shape subscriptions.
- Screener: option chain snapshots per symbol on demand.

### Publication storage

Publications are stored as `thread_artifacts` rows:

| Column | Value |
|--------|-------|
| `thread_id` | Source research thread |
| `kind` | `'finance_publication'` |
| `content` | JSON blob with `{ publicationKey, kind, status, version, ... }` |

Active publications are filtered `WHERE status != 'revoked'` and ordered by
`(publicationKey, version DESC)` for deduplication.

Publication-specific Continuity Graph events (`finance.published`,
`finance.revised`, `finance.revoked`) emit through the existing graph event
infrastructure.

## References

- [ADR-014](docs/decisions/ADR-014-finance-publication-gate.md) — publication gate
- [ADR-020](docs/decisions/ADR-020-quant-research-finance-integration.md) — channel integration
- [ADR-017](docs/decisions/ADR-017-public-com-screener-migration.md) — Public.com migration
