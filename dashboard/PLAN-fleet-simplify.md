# BUILD SPEC — Fleet page simplify

**Status:** spec  
**Audience:** pi agent  
**Workdir:** `/Users/bencharney/activity-feed/dashboard`  
**Branch:** `theme-prototype` (or whatever is current)  
**Depends on:** nothing — fleet page is self-contained  
**Tududi:** [activity-dashboard-pwa](http://100.101.106.60:3002/project/w3yg7n93tat3t6p) · stage `fleet-simplify`

---

## Problem

The Fleet page (`src/app/fleet/FleetPage.tsx`, ~650 lines with RegistryPanel) tries to do too much:

| Noise | Problem |
|-------|---------|
| Control modes (Observe/Assist/Operator) | Aspirational framework — no actions actually need a mode gate |
| Telemetry modes (Snapshot/Live/Historical) | "Historical" is a stub. Live is the only real mode. |
| "What the page shows" info grid | Explains what it should do instead of doing it |
| "Enablement options" panel | Future safety policy, no current function |
| "Safe action rail" panel | Duplicates control buttons already on each host card |
| "Load routing" panel | Routing doesn't exist — just recommends the lightest machine |
| Dark gradient header with 4 stat cards | Heavy chrome that says little |
| Registry tab | Entirely separate concern (agent capability catalog) |

**What the page should actually do:** Show Mac mini, Zima, and OVH health at a glance with a few useful actions. That's it.

---

## Target design

### Single view — no tabs

Drop the Machines/Registry tab switcher entirely. Fleet is one page: three host cards.

### Layout

```
┌──────────────────────────────────────────────┐
│  Fleet                            updated 12s │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Mac mini │  │ Zima OS  │  │  OVH VPS │   │
│  │          │  │          │  │          │   │
│  │ CPU  62% │  │ CPU  34% │  │ CPU  18% │   │
│  │ MEM  48% │  │ MEM  41% │  │ MEM  29% │   │
│  │ DISK 71% │  │ DISK 83% │  │ DISK 22% │   │
│  │ LOAD1.44 │  │ LOAD0.62 │  │ LOAD0.28 │   │
│  │          │  │          │  │          │   │
│  │ [SSH]    │  │ [SSH]    │  │ [SSH]    │   │
│  │ [Paseo]  │  │ [Cronic] │  │ [Attach] │   │
│  └──────────┘  └──────────┘  └──────────┘   │
│                                              │
│  ▸ Top processes (click to expand)           │
│  ▸ Container stacks (click to expand)        │
│                                              │
│  Status: Live fleet snapshot from 14:32:05   │
└──────────────────────────────────────────────┘
```

### Each host card shows:

1. **Header:** name, shortName, role, health badge, transport
2. **Four metric bars:** CPU, Memory, Disk, Load — with current values
3. **Services:** comma-separated pills (no "selected host" concept)
4. **2–3 action buttons:** SSH shell (copy command), open service URL, inspect/refresh
5. **Collapsed detail:** top processes + containers in expandable `<details>` — open one host at a time

### Removed entirely:

- ❌ Control mode selector (Observe/Assist/Operator)
- ❌ Telemetry mode selector (Snapshot/Live/Historical)
- ❌ "What the page shows" explanation grid
- ❌ "Enablement options" safety policy panel
- ❌ "Safe action rail" duplicate panel
- ❌ "Load routing" recommendation panel
- ❌ Registry tab and RegistryPanel component
- ❌ Dark gradient hero header with 4 stat summary cards
- ❌ "Selected host" concept (all three shown equally)
- ❌ `selectedHost` state + onSelect callback

### Kept / simplified:

- ✅ Live polling every 15s via `/api/fleet`
- ✅ Status line at bottom for action feedback
- ✅ SSH command copy, service URL open, inspect/refresh
- ✅ `fleet.ts` host definitions unchanged
- ✅ `fleet-server.ts` backend unchanged
- ✅ Error state if fleet API is down

### RegistryPanel separation

RegistryPanel (`src/app/fleet/RegistryPanel.tsx`) is a real feature (agent capability catalog) but doesn't belong on the fleet page. Move it to its own route:

- **New route:** `/ops/registry`
- **Fleet page:** no more tab switcher, no RegistryPanel import
- **Ops nav:** add Registry link if it fits, or keep it standalone

---

## PHASES

### Phase 0 — Audit (read-only)

1. Confirm `/api/fleet` returns live data for all 3 hosts
2. Note current `FleetHost` type — we keep it unchanged
3. Confirm action buttons work (SSH copy, URL open, inspect/refresh)
4. Note RegistryPanel routes currently used

### Phase 1 — Simplify FleetPage

**File:** `src/app/fleet/FleetPage.tsx` — full rewrite (~200 lines target)

**What changes:**
- Remove: `fleetView` state, tab switcher nav, control/telemetry mode selectors, hero header with 4 stat cards, "What the page shows" grid, "Enablement options" panel, "Safe action rail" panel, "Load routing" panel, `selectedHost` state, `recommendedHost`/`recommendedCommand` logic
- Remove: `ControlMode`/`TelemetryMode` types, `CONTROL_MODES`/`TELEMETRY_MODES` arrays
- Keep: `HostCard`, `MetricBar`, `ControlPill`, `DetailPanel`, `DetailRow`, `toneStyles`, `formatPct`
- Keep: `snapshot`, `snapshotError`, `statusLine` state, `loadSnapshot`, `runAction`, 15s polling
- Simplify `HostCard`:
  - Remove `selected`/`onSelect` props
  - Make processes/containers collapsed by default (openable independently per card)
  - Keep metric bars, services pills, action buttons
- Replace header with compact title + "updated Xs ago" + health summary
- Add expandable collapsible sections below the 3 cards: "Top processes" and "Container stacks" — one `<details>` per host, independent open/close

### Phase 2 — Move RegistryPanel to /ops/registry

1. Create `src/app/ops/registry/page.tsx` that renders `RegistryPanel`
2. Remove `RegistryPanel` import from `FleetPage.tsx`
3. Delete `fleetView`/tab switcher logic from `FleetPage.tsx`

### Phase 3 — Verify

- [ ] `/fleet` loads 3 host cards with live metrics
- [ ] Each card shows CPU/Mem/Disk/Load bars, services, action buttons
- [ ] SSH button copies correct command per host
- [ ] Service URLs open in new tab
- [ ] Processes/containers expand per host independently
- [ ] Status line updates on actions
- [ ] Error state shows when fleet API is down
- [ ] `/ops/registry` loads RegistryPanel
- [ ] No broken imports or dead code

### Phase 4 — Tududi sync

- [ ] Mark fleet-simplify tasks complete
- [ ] Update `PLAN-workflow-next.md` fleet entry if present

---

## Rollback

```bash
git checkout src/app/fleet/FleetPage.tsx
# If Phase 2 was done:
rm -rf src/app/ops/registry
git checkout src/app/fleet/RegistryPanel.tsx  # if it was deleted
```

---

## Non-goals

- Changing fleet-server.ts backend
- Changing fleet.ts host definitions
- Adding new API endpoints
- OVH deploy
- Touching bottom-nav (fleet isn't in the 4-tab nav — reachable from Ops or direct URL)
