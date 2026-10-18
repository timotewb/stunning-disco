# Capacity Over Time — Design Proposal

> Status: **proposal, not yet implemented.**
> Listed in `practice app spec.md` §19 Future Enhancements as "capacity planning".

## 1. The problem

The practice lead needs to answer, over a date range:

- How much capacity does the team actually have, week by week?
- What happens when someone goes on leave, drops to part-time, joins, or leaves?
- **What is the resource requirement on the team over the same period, and where does it exceed capacity?**
- How does that break down by role, seniority, or tag?
- Where are the troughs — the weeks where capacity dips and commitments shouldn't be made?

None of this is answerable today.

## 2. What exists today

| Surface | Shows | Why it isn't capacity |
|---|---|---|
| **Timeline** (`pages/Timeline.tsx`) | Gantt of allocated `WorkRequest`s per person, lane-stacked | Committed work, not availability. Bars are never summed or subtracted from a baseline |
| **Dashboard** (`pages/Dashboard.tsx`) | Headcount tiles + capability coverage | Point-in-time; no time axis |
| **Capabilities** (`pages/Capabilities.tsx`) | Skill coverage across the dimension tree | Skills, not availability |
| **Requests → `DemandCharts`** | Incoming request volume/mix analytics | Demand side only |

### The modelling gaps

Confirmed against `backend/prisma/schema.prisma`:

1. **No capacity field at all.** `TeamMember` is `id, name, role, seniority, tags, notes, isLeaving, hasLeft, createdAt`. There is no FTE, hours, or contracted-days attribute — the app literally cannot represent "Jane moved to 0.6 FTE in March".

2. **No dates on joining or leaving.** `isLeaving` and `hasLeft` are undated booleans. A departure cannot be placed on a time axis, so it cannot reduce future capacity.

3. **Leave is modelled as work.** Leave exists only as a `WorkRequest` with an `allocationType` sourced from `AllocationTypeConfig`. There is no baseline for it to subtract from. Worse, `pages/Requests.tsx:183` identifies leave by string-sniffing — `t.name.toLowerCase().includes('leave')` — which is fragile.

4. **Snapshots don't help.** `Snapshot` scopes only `MatrixEntry` and `SMEAssignment`. Team composition and availability are not snapshotted, so playback can't reconstruct historical capacity.

## 3. Proposed model

Three changes, all additive.

### 3.1 Baseline and tenure on `TeamMember`

```prisma
model TeamMember {
  // ... existing fields ...
  baselineFte     Float            @default(1.0)
  startDate       DateTime?
  endDate         DateTime?
  capacityChanges CapacityChange[]
}
```

- `baselineFte` — the member's default commitment, `1.0` = full time.
- `startDate` / `endDate` — the tenure window. `null` means "unbounded in that direction", so existing records need no backfill.
- `endDate` supersedes `isLeaving` / `hasLeft` as the *source of truth for capacity*. A future-dated `endDate` naturally expresses "is leaving"; a past-dated one expresses "has left". The existing booleans stay for directory filtering (see §7.2).

### 3.2 Effective-dated changes, open-ended or bounded

```prisma
model CapacityChange {
  id            String     @id @default(uuid())
  teamMemberId  String
  effectiveFrom DateTime
  effectiveTo   DateTime?
  fte           Float
  reason        String?
  notes         String?
  createdAt     DateTime   @default(now())
  teamMember    TeamMember @relation(fields: [teamMemberId], references: [id], onDelete: Cascade)

  @@index([teamMemberId, effectiveFrom])
}
```

`effectiveTo` is what makes **temporary** reductions first-class:

- **`effectiveTo = null`** — an open-ended step change. "Moved to 0.6 FTE from March." Persists until another change supersedes it.
- **`effectiveTo` set** — a bounded reduction that auto-reverts. "Working 0.5 for three weeks in April." One row, no need to remember to add a second row restoring the original figure.

The bounded form is the common real-world case — someone at full time dropping their hours for a few weeks — and modelling it as a pair of step changes would be error-prone (forget the second row and capacity is silently wrong forever).

**Resolution rule — effective FTE for member `m` on date `d`:**

1. If `m.startDate` is set and `d < m.startDate` → `0`
2. If `m.endDate` is set and `d > m.endDate` → `0`
3. Otherwise collect every `CapacityChange` where `effectiveFrom <= d` **and** (`effectiveTo` is null **or** `d <= effectiveTo`)
4. Of those, the one with the greatest `effectiveFrom` wins — most recent change takes precedence
5. If none match → `m.baselineFte`

Rule 4 is what lets a temporary reduction nest inside a permanent one and then correctly unwind. Worked example — baseline `1.0`, permanent drop to `0.6` from 1 Jan (open-ended), temporary `0.3` for the month of March:

| Date | Matching changes | Result |
|---|---|---|
| Feb | Jan only | `0.6` |
| Mar | Jan + Mar; Mar has the later `effectiveFrom` | `0.3` |
| Apr | Jan only (Mar's `effectiveTo` has passed) | `0.6` |

No interpolation anywhere — a pure step function, predictable and easy to explain in the UI.

**Validation:** `effectiveTo >= effectiveFrom` when set, and `fte >= 0`. Overlapping rows with the *same* `effectiveFrom` are ambiguous, so that combination is rejected.

### 3.3 Make "leave" explicit

```prisma
model AllocationTypeConfig {
  // ... existing fields ...
  reducesCapacity Boolean @default(false)
}
```

Replaces the `.includes('leave')` string-sniff with a real flag, configurable in Settings. Seeded `true` for the built-in `leave` type. Any allocation type can then be marked as capacity-reducing — useful for secondments or parental leave with distinct colours.

### 3.4 Weight allocations so demand is measurable

**Decision (confirmed):** the view must answer both *"what capacity do we have"* and *"what is being asked of us"*, so committed work is overlaid.

```prisma
model WorkRequest {
  // ... existing fields ...
  allocationFte Float @default(1.0)
}
```

`allocationFte` is **a fraction of that person's capacity**, not an absolute. So a member on `0.6` FTE allocated to a project at `allocationFte = 1.0` contributes `0.6` FTE of demand, not `1.0`.

The existing `effort` field cannot be reused for this. It is a t-shirt size describing *total duration* — the seeded values in `scripts/seed-request-configs.ts:49` are `XS — hours` through `XL — multiple months`. Duration says nothing about intensity: a month-long project might consume a half a person or three.

Defaulting to `1.0` matches the common case (a person is *on* the thing) and keeps every existing row meaningful without backfill. Users dial it down for split commitments.

**This unifies leave with demand.** Leave deduction and demand contribution become the same calculation:

```
contribution(m, d, request) = effectiveFte(m, d) × request.allocationFte
```

Leave is simply a contribution from a `reducesCapacity` type. One code path, two readings.

### 3.5 Public holidays

```prisma
model Holiday {
  id        String   @id @default(uuid())
  name      String
  date      DateTime @unique
  createdAt DateTime @default(now())
}
```

A flat, fully editable list seeded with NZ national public holidays and managed in Settings. Deliberately **not** computed from rules: Easter and Matariki are not derivable from a simple formula, and Mondayisation makes the observed date differ from the nominal one. Seeding concrete observed dates is simpler and auditable.

Regional anniversary days are not modelled separately — the list is editable, so the relevant one is simply added as a row. A `region` column would require regions on `TeamMember` for no real gain at this team size.

> **Implementation note:** seed dates must be taken from the official source (employment.govt.nz) at build time and verified, **not** generated from memory. Mondayised observed dates are easy to get subtly wrong, and a wrong holiday silently skews every weekly figure.

#### Holidays must reduce capacity, not be excluded from it

This is the subtle part. Weekends are excluded from the working-day set entirely. Holidays must **not** be — they are working days with zero capacity.

If a holiday were simply excluded, a week containing one would have four working days, and a full-time person would average `1.0` across them — the dip would vanish, which is the opposite of what's wanted. Treating it as a zero-capacity working day gives `4/5 × 1.0 = 0.8`, and the dip is visible.

Demand is zeroed on holidays too. Project work cannot be delivered on a public holiday, so leaving demand at full strength would manufacture phantom overcommitment in every holiday week.

Leave falling on a holiday needs no special handling: capacity is already `0` that day and `available` is clamped at `>= 0`, so it cannot double-count.

## 4. Computation

### Daily resolution, bucketed for display

For each day in the requested range, for each member:

```
isWorkingDay(d)  = d is Mon–Fri                  (weekends excluded from the set)
isHoliday(d)     = a Holiday row exists for d

capacity(m, d)   = isHoliday(d) ? 0 : effectiveFte(m, d)
leave(m, d)      = Σ contribution over allocations whose type has reducesCapacity = true
available(m, d)  = max(0, capacity(m, d) − leave(m, d))
demand(m, d)     = isHoliday(d) ? 0
                 : Σ contribution over allocations whose type has reducesCapacity = false
```

using `contribution` from §3.4. **Leave subtracts from capacity** (confirmed decision) but is rendered as its own band so the pre-leave baseline stays readable on the same chart.

Holidays are **working days with zero capacity**, not excluded days — see §3.5 for why that distinction matters. Weekends are genuinely excluded.

Days are then averaged into the display bucket (week or month) over its working days, so a two-day absence in a five-day week correctly reads as `0.6`, and a single public holiday reads as `0.8`.

`demand > available` in a bucket is **overcommitment** — the signal most worth surfacing. It is flagged per bucket and per member.

Cost is trivial — ~20 members × ~365 days is a few thousand iterations in memory.

### API

```
GET /api/capacity?from=2026-01-01&to=2026-12-31&bucket=week&groupBy=role
```

| Param | Values | Default |
|---|---|---|
| `from`, `to` | ISO dates | required |
| `bucket` | `week` \| `month` | `week` |
| `groupBy` | `none` \| `role` \| `seniority` \| `tag` | `none` |

Response:

```json
{
  "buckets": [{ "start": "2026-01-05", "end": "2026-01-09", "label": "5 Jan" }],
  "series": [
    {
      "key": "Engineer",
      "capacity":  [4.0, 4.0, 3.6],
      "leave":     [0.0, 0.8, 0.0],
      "available": [4.0, 3.2, 3.6],
      "demand":    [3.5, 3.5, 4.1],
      "overcommitted": [false, false, true]
    }
  ],
  "totals": { "capacityFteNow": 17.6, "availableFteNow": 16.2, "demandFteNow": 15.0 }
}
```

New router `backend/src/routes/capacity.ts`, mounted at `/api/capacity`, following the existing one-file-per-resource convention. CRUD for `CapacityChange` lives in the same router.

## 5. The view

New page at `/capacity`, added to `components/Sidebar.tsx`.

```
+----------------------------------------------------------+
| Capacity & Demand                                         |
| From [2026-01-01] To [2026-12-31]  Bucket [Week v]        |
| Group by: ( ) None (•) Role ( ) Seniority ( ) Tag         |
|----------------------------------------------------------|
| Available 16.2  Demand 15.0  Headroom 1.2                 |
| ⚠ 3 weeks overcommitted — worst w/c 13 Apr (−2.4)         |
|----------------------------------------------------------|
|  20 |                                                     |
|     |  ████████████▓▓▓▓████████████   █ available         |
|  10 |  ──────╲____╱──────╲_______     ▓ leave             |
|     |  ████████████▓▓▓▓████████████   ─ demand            |
|   0 +-----------------------------------------------      |
|       Jan      Apr      Jul      Oct                      |
|----------------------------------------------------------|
| Role        | Avail | Demand | Headroom | Worst week      |
| Engineer    | 7.0   | 8.2    | −1.2  ⚠  | w/c 13 Apr      |
| Architect   | 3.0   | 2.1    | +0.9     | —               |
+----------------------------------------------------------+
```

Built with **recharts** (already a dependency, used by `DemandCharts.tsx`). A stacked `AreaChart` gives available vs. leave; a `Line` overlays demand. Where the demand line rises above the available band, the team is overcommitted — the single most useful read on the page. Buckets in that state are tinted and counted in the header. Colours reuse the `PALETTE` map from `DemandCharts.tsx`.

A summary table below the chart gives available, demand, headroom, and worst week per group.

An **hours** toggle converts every FTE figure for display using `hoursPerFte` (§6 Q1). Capacity is always stored and computed in FTE.

### Making reduced-hours periods visible

A temporary reduction appears three ways, so it is never missed:

1. **On the chart** — the available band dips for the duration, with the pre-change level still readable as the top of the leave band.
2. **On hover** — the bucket tooltip names who is reduced and why, e.g. *"Jane Smith 1.0 → 0.5 (reduced hours)"*, sourced from `CapacityChange.reason`.
3. **On the Team page** — the member's capacity section lists each change as a dated row with its period, so a bounded reduction reads as "0.5 FTE, 6–24 Apr" rather than two disconnected step changes.

### Editing

Capacity data is edited on the **Team** page, in a per-member "Capacity" section: baseline FTE, start/end dates, and a small add/remove list of effective-dated changes. No new top-level editing surface.

## 6. Open questions

### Resolved

**Q1. FTE or hours per week? — FTE, with optional hours display.**
Capacity is stored and computed in FTE. An `hoursPerFte` setting (default `37.5`) drives an optional "show as hours" toggle on the capacity page, converting for display only. Stored as `capacity-config.json` alongside the DB, matching the existing `ai-config.json` pattern in `routes/ai.ts:19`.

A consequence: **temporary reduced-hours periods must be visible**, not just permanent FTE changes. This drove `effectiveTo` on `CapacityChange` (§3.2) so "full-timer working 0.5 for three weeks in April" is one row that auto-reverts, and surfaces as a visible dip in the chart.

**Q2. Should leave subtract from capacity? — YES.**
Leave subtracts, and is rendered as its own band so the pre-leave baseline stays readable. See §4.

**Q3. Should committed project work be overlaid? — YES.**
The view must answer both *"what capacity do we have"* and *"what is the resource requirement on us"*. This pulls `allocationFte` on `WorkRequest` into v1 scope (§3.4) and makes overcommitment detection the headline signal. Editing `allocationFte` is added to the Timeline allocation form and the Requests side panel.

**Q4. What should happen to existing members marked `hasLeft`? — Prompt for dates; count as present until supplied.**
Migration backfills `endDate` as `null`. The capacity page surfaces a dismissable banner listing every member with `hasLeft = true` (or `isLeaving = true`) and no `endDate`, linking straight to their Team page capacity section.

Until dated they count as present, which overstates capacity — but **visibly and fixably** rather than silently. The alternative, excluding them outright, would silently *understate* historical capacity with no prompt to correct it, and would make past periods wrong in a way the user could not see.

The banner clears itself once every flagged member has an `endDate`.

**Q5. Public holidays? — YES, in v1.**
A `Holiday` table (§3.5), seeded with NZ national holidays and editable in Settings. Holidays are modelled as zero-capacity *working days* so the dip is visible, rather than excluded days which would hide it. Demand is zeroed on holidays too, to avoid phantom overcommitment in holiday weeks.

### All questions resolved — ready to build.

### Minor note

`capacity-config.json` sits outside the `dataMigration` export, so the hours-per-FTE setting won't survive a backup/restore. It is a single display-only number and trivially re-entered; promoting it to a table is not worth the schema cost unless more app-level settings appear.

## 7. Impact on existing code

### 7.1 Must be updated

- **`backend/src/routes/dataMigration.ts`** — export (line ~85) and import (line ~216) both enumerate every model explicitly. `CapacityChange` **and `Holiday`** must be added to both, plus the counts block at line ~128, or backups will silently drop capacity history and the holiday calendar.
- **`backend/src/routes/allocationTypes.ts`** — seed `reducesCapacity: true` for the default `leave` type (line 9).
- **`frontend/src/pages/Requests.tsx:183`** — replace the `.includes('leave')` sniff with the new `reducesCapacity` flag.
- **`frontend/src/pages/Timeline.tsx`** — add `allocationFte` to the allocation form (`emptyForm`, line ~66) and show it on the bar tooltip. Without an editing surface the demand overlay is stuck at the `1.0` default.
- **`frontend/src/pages/Requests.tsx`** — same field in the request side panel's allocation section.
- **`frontend/src/types/index.ts`** and **`api/client.ts`** — new types and calls, per existing convention.
- **`practice app spec.md`** — move capacity planning out of §19 Future Enhancements.

### 7.2 Deliberately left alone

`isLeaving` and `hasLeft` keep their current meaning for the Team directory. Capacity reads `endDate` only. Once the dates are populated the booleans become derivable and could be retired, but that's a separate cleanup.

### 7.3 Migration

Unlike the Notes refresh work, **this requires a Prisma migration**. All columns are nullable or defaulted, so it applies cleanly to existing data with no manual intervention. In Docker, `prisma migrate deploy` runs automatically on container start.

## 8. Suggested build order

1. Schema + migration (`TeamMember` fields, `CapacityChange`, `reducesCapacity`, `allocationFte`)
2. Capacity computation module with the resolution rule from §3.2 and the contribution rule from §3.4
3. `GET /api/capacity` + `CapacityChange` CRUD
4. Team page capacity editing; `allocationFte` on the Timeline and Requests allocation forms
5. `/capacity` page, chart, and overcommitment surfacing
6. `dataMigration` + `allocationTypes` + `Requests.tsx` leave-flag updates
7. Verify end-to-end, including a backup/restore round-trip

Steps 1–3 are the substance; 4–5 are the surface; 6 is the debt that must not be forgotten.
