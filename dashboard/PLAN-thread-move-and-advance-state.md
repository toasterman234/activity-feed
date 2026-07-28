# PLAN — Move threads across channels + Advance-state buttons

**Status:** shipped on OVH (move-thread API + dialog; advance/GuideBar path live)  
**Repo:** `/Users/bencharney/activity-feed/dashboard`  
**Related:** `#meta` / Graph continuity thread; lifecycles in `src/app/channels/lifecycles.ts`  
**Does not depend on** `CHANNEL_GRAPH` / B+C+D graph tables — ship independently (useful immediately).

---

## Why

1. **Advance state** — StateFlow is display-only today. Humans cannot move `drafting → review → accepted` without asking `@pi` for `nextState`. That blocks using planning/coding lifecycles as a real control surface.
2. **Move thread** — Threads are stuck in the channel they were born in. Design work landed in `#meta` by choice; users need to relocate threads (e.g. meta → Experiments, or Research → coding channel) without copy-paste.

---

## Current data model (relevant facts)

| Table | Has `channel_id`? | Notes |
|-------|-------------------|--------|
| `messages` | **yes** | Root message: `thread_id IS NULL`, id = thread id. Replies: `thread_id = root id`. |
| `thread_meta` | **yes** | Lifecycle/state live here. |
| `thread_plans` | no | Keyed by `thread_id` only → **moves with the thread**. |
| `thread_artifacts` | no | Same. |
| `thread_workflow_steps` | no | Same. |
| `thread_promotions` | no | Same. |

**Implication:** “Move thread to another channel” = update `channel_id` on **all messages in the thread** + `thread_meta`. Plans/artifacts/steps follow automatically.

There is **no** first-class “plan belongs to a channel.” Moving “plans to a channel” in v1 means moving the **thread that owns them**. Optional v2: copy/move individual plan rows to another thread.

State writes today:
- Agent path: `trigger/route.ts` applies `nextState` after `canTransition`, then runs **command** workflows for the target state (gates on failure).
- Write path: `write/route.ts` already rejects illegal `thread_meta.state` changes via `canTransition`.
- UI: `StateFlow.tsx` renders states; **no click handlers**.

---

## Feature A — Advance-state buttons

### Goal
On the thread detail page, show **one button per legal next state** so a human can advance (or stop/reject) without an agent.

### UX

Location: thread detail (`[channelId]/[threadId]/page.tsx`), directly under or integrated with `StateFlow`.

```
State — Planning          ● now: Drafting
[diagram…]

Advance
  [ → Review ]   [ → Blocked ]   [ → Stopped ]
```

Rules:
- Buttons = `LIFECYCLES[lifecycle].transitions[currentState]` only (never show illegal targets).
- Label with human state label (`Review`, not `review`).
- Terminal states (`accepted`, `stopped`, …): show “No further transitions” / hide Advance row.
- No lifecycle picked yet: hide Advance (same as StateFlow).
- Archived thread (`archived_at` set): disable Advance.
- Confirm only for **dead/terminal** targets (`stopped`, `rejected`, `wont_fix`, `accepted`?) — recommend confirm for `stopped` / `rejected` / `wont_fix` / `accepted`; soft transitions (e.g. `drafting → review`) one tap.
- Mobile: full-width stacked buttons, thumb-friendly.

### Behavior (must match agent path where it matters)

Extract shared helper (new module), e.g. `src/app/channels/transitionThread.ts` / used from API:

```
transitionThreadState({ threadId, channelId, toState, actor: 'you' | '@pi' | … })
  1. Load thread_meta + lifecycle
  2. canTransition(lc, from, to) or 409
  3. Find command workflows with runsAt === toState && enabled && kind === 'command'
  4. Run them in resolveCwd (same as trigger) — if any gates:true fails → stay on fromState, write workflow step failure, return 409/200 with blocked detail
  5. Else UPDATE thread_meta.state = toState
  6. Append a system-ish message? (optional v1) — recommend YES: author `system`, body `State: drafting → review (you)`
  7. Return { ok, from, to, ranCommands[] }
```

Wire:
- **New API** `POST /api/channels/transition` `{ threadId, channelId, toState }` — preferred over overloading `write` so command workflows run.
- Refactor `trigger/route.ts` nextState block to call the same helper (single source of truth).
- UI buttons call this API, then `extras.refresh()`.

### Non-goals (Advance v1)
- Free-form jump to any state (skip `canTransition`).
- Editing lifecycle type via Advance (lifecycle select stays as today; still locked after leaving `drafted`).
- Bulk advance many threads.
- Replacing agent `nextState` (agents keep working).

### Acceptance
- Planning thread in `drafting`: buttons Review / Blocked / Stopped appear; Review → state `review`, StateFlow updates, optional system message.
- Coding `testing` with gated `unit-tests` enabled: Advance → Review runs `npm test`; on failure state does **not** advance (same as @mention path).
- Illegal target via API → 409.

---

## Feature B — Move thread to another channel

### Goal
Relocate an entire thread (messages + meta + plans + artifacts + steps) from channel A to channel B, then land on the new URL.

### UX

Thread detail header actions (near back link / promote):

```
[ Move… ]
  → sheet/dialog: “Move to channel”
  → select other channels (exclude current)
  → optional note: “Plans, artifacts, and history move with the thread.”
  → [Cancel] [Move]
```

After success: `router.push(/channels/{toChannelId}/{threadId})` and toast/banner “Moved from #meta”.

Channel list: no drag-and-drop in v1 (phone-hostile). Optional later: long-press on thread row → Move.

### Behavior

**New API** `POST /api/channels/move-thread`:

```json
{ "threadId": "…", "fromChannelId": "…", "toChannelId": "…" }
```

Server steps (single transaction):

1. Validate thread root exists: `messages.id = threadId AND thread_id IS NULL AND channel_id = fromChannelId`.
2. Validate `toChannelId` exists and `≠ fromChannelId`.
3. Refuse if `thread_meta.archived_at` set (or allow with `force` — **v1 refuse** with clear error).
4. Refuse if promotion in progress (`thread_promotions.status = 'running'`) if that status exists.
5. `UPDATE messages SET channel_id = toChannelId WHERE channel_id = fromChannelId AND (id = threadId OR thread_id = threadId)`.
6. `UPDATE thread_meta SET channel_id = toChannelId, updated_at = now() WHERE thread_id = threadId`.
7. **Lifecycle policy (v1):** keep `lifecycle` + `state` + `enabled_workflows` as-is (thread identity preserved). Do **not** auto-switch to destination `default_lifecycle`.
8. Append system message on the thread: `Moved from #<fromName> → #<toName> (you)`.
9. Commit; return `{ ok, threadId, toChannelId }`.

Electric/shapes: messages shape is channel-filtered on the client; after move, old channel list drops the thread on next sync; new channel picks it up. No schema migration required.

### “Move plans” clarification

| Ask | v1 answer |
|-----|-----------|
| Move thread’s plans to another channel | **Move the thread** (plans follow). |
| Move/copy one plan item to another thread | **Out of scope v1** — add later as `POST /api/channels/move-plan` if needed. |
| Duplicate thread into another channel | Out of scope v1 (copy is harder: new ids for root + replies + meta). |

### Edge cases

| Case | v1 behavior |
|------|-------------|
| Destination missing | 404 |
| Thread already in destination | 409 |
| Concurrent replies during move | Transaction; brief race acceptable |
| Issue thread with `repo_id` | Keep metadata; cwd resolution uses new channel’s project member on next @mention — **call out in UI** if destination has no project member |
| User viewing old URL after move | Thread page should 404 or redirect: load root by `threadId` only; if `channelId` mismatch → redirect to canonical `/channels/{actual}/{threadId}` |

**Redirect helper (include in v1):** on thread page mount, if `thread_meta.channel_id !== channelId` from URL, `router.replace` to correct channel. Prevents broken bookmarks after move.

### Non-goals (Move v1)
- Drag-and-drop between channel lists.
- Moving only a subset of messages.
- Cross-DB / export.
- Auto-changing lifecycle to destination default.
- Permissions model beyond single-operator app.

### Acceptance
- Move Graph continuity thread from `#meta` → `#Experiments` → appears only under Experiments; plans + DESIGN.md intact; URL updates; system message logged.
- Opening old `/channels/metaId/threadId` redirects to Experiments URL.
- Archived thread: Move disabled + API 409.

---

## Implementation order

1. **Advance state** (smaller, unblocks planning UX immediately)
   - Extract `transitionThreadState` from trigger
   - `POST /api/channels/transition`
   - Buttons on thread page
2. **Move thread**
   - `POST /api/channels/move-thread`
   - Move dialog + canonical redirect on thread page
3. Polish: confirm modals, disabled states, mobile layout

Estimate: Advance ~0.5–1 day; Move ~0.5–1 day including redirect edge case.

---

## Files likely touched

| Area | Files |
|------|--------|
| Shared transition | **new** `src/app/channels/transitionThread.ts` (or under `src/lib/`) |
| APIs | **new** `src/app/api/channels/transition/route.ts`, **new** `…/move-thread/route.ts`; refactor `trigger/route.ts` |
| UI | `[threadId]/page.tsx`, maybe extract `AdvanceStateButtons.tsx`, `MoveThreadDialog.tsx`; light tweak `StateFlow.tsx` |
| Docs | this PLAN; short note in `#meta` DESIGN / thread |

No Postgres DDL for either feature.

---

## Relationship to Graph Continuity (B+C+D)

- Ship **before or beside** Phase 1 graph work — no dependency.
- Later, Advance/Move should emit `graph_events` when `CHANNEL_GRAPH=1` (follow-up); not required for v1.
- Moving the continuity thread out of `#meta` is a valid use of Feature B once shipped.

---

## Open decisions (defaults chosen)

| Topic | Default for v1 |
|-------|----------------|
| Confirm on soft advances? | No — only on terminal/dead |
| System message on advance? | Yes |
| System message on move? | Yes |
| Keep lifecycle on move? | Yes |
| Move individual plans? | No (thread only) |
| Run gated command workflows on human Advance? | **Yes** (parity with @mention) |
