# Demand Planning — Design Proposal

Forward-looking demand from a pipeline of initiatives, overlaid on actual
capacity, so pressure points are visible far enough ahead to act on them.

## 1. The problem

The Capacity view answers "what can we deliver, and what's already committed".
It cannot answer "what is coming". Committed work is, by definition, work that
has already landed on someone. By the time it shows up, the staffing decision
has been made.

What's missing is the step before that: a pipeline of initiatives, each needing
a certain shape of person for a certain window, none of it assigned yet. The
question is not "who is busy" but "when does the ask exceed the team, and in
which role".

## 2. What exists today

The capacity engine (`backend/src/lib/capacity.ts`) computes per-bucket
capacity, leave, available and demand, grouped by role, seniority or tag. It
handles holidays, tenure windows, effective-dated FTE changes and bucket
clipping.

### The modelling gap

Demand is reachable only through a person. `computeCapacity` loops
`for (const member of members)` and reads that member's allocations from
`byAssignee`. An unassigned `WorkRequest` contributes exactly zero demand. There
is no way to express "we will need two data engineers in March" without first
inventing the people to hang it on.

There is also no grouping above a work request. `WorkRequest` has `type`, `tags`
and `externalRef`, but no parent, so there is nothing that represents an
initiative or a project.

### The unit mismatch

`WorkRequest.allocationFte` is a *fraction of a named person's capacity* — a 0.6
FTE member allocated at 1.0 contributes 0.6 FTE. Planned role demand is an
*absolute ask*: "2.0 FTE of Data Engineer", independent of who fills it. These
are different quantities and cannot share a field or a code path.

## 3. Proposed model

```
Initiative ──1:N──> Project ──1:N──> RoleDemand
                                          │
                                          └──0:1──> WorkRequest (once staffed)
```

### 3.1 Initiative

A programme of work. Carries the confidence that it will actually happen.

- `name`, `description`
- `confidence` — `candidate` | `probable` | `committed`
- `colour`, `orderIndex`, `status`

Confidence **filters only**; it never weights the FTE. A 2.0 FTE ask at 70%
confidence is still 2.0 FTE when shown. Weighting would produce numbers that
cannot be explained to anyone — "we need 1.4 engineers" is not actionable, and
the arithmetic hides which initiative drove it. Filtering answers the same
question honestly: show committed only, then show everything, and compare.

### 3.2 Project

A deliverable within an initiative. Demand attaches here and only here.

- `initiativeId`, `name`, `notes`
- `startDate`, `endDate` — optional, used to default demand dates

An initiative with a single project of the same name is a perfectly good way to
express initiative-level demand. Allowing demand on both levels would mean two
places to look for the same number.

### 3.3 RoleDemand

The actual ask.

- `projectId`
- `role` — free text
- `seniority` — optional
- `fte` — absolute, e.g. `2.0`
- `startDate`, `endDate`
- `fulfilledByRequestId` — null until staffed

#### Roles stay free text

The app has config tables for seniority, allocation types and request
taxonomies, so a `RoleConfig` table would fit the pattern and would guarantee
that demand roles match capacity roles.

It would also break the feature. Forward planning explicitly includes roles the
team does not have yet. "3.0 FTE of ML Engineer against zero capacity" is not a
data error — it is the hiring signal, and the most valuable thing this view can
surface. Constraining demand to roles already on staff would silently delete it.

The form autocompletes from roles currently in use, so the common case matches
by default, while new roles remain expressible.

### 3.4 Staffing, and not double-counting

When a planned demand is filled by a real person, the work exists twice: once as
the original `RoleDemand`, once as an allocated `WorkRequest`. Counting both
would overstate the ask.

`RoleDemand.fulfilledByRequestId` links the two. When set, the engine counts the
real allocation and skips the demand. The original plan stays visible and
editable — useful for seeing what was asked for versus what was actually
staffed — but contributes nothing to the totals.

Setting the link to a request that is not allocated, or whose dates do not
overlap the demand, would silently drop demand from the chart. The API rejects
the link unless the request is allocated.

## 4. Computation

### Extend the engine, do not write a second one

`computeCapacity` gains a `roleDemands` input and the result gains a planned
series. Bucketing, clipping, UTC handling and holiday logic stay in one place.
A parallel engine would drift from the first one within a release.

Per day, per demand:

```
if (isHoliday or weekend) contribution = 0
else                      contribution = fte
```

then averaged over the bucket's working days, exactly as capacity is.

#### Planned demand must dip on holidays too

Capacity is already zero on holidays. If planned demand is not, every holiday
week shows an artificial spike in pressure that will not happen. This is the
same trap as the capacity work — there, demand from allocations had to be zeroed
on holidays for the same reason. The rule is that both sides of a comparison
must be measured on the same calendar.

### Grouping

Planned demand groups by initiative, project or role. Role grouping is what
aligns it with capacity; initiative grouping is what makes it explainable.

### Role matching

Demand grouped by role is compared against capacity for the same role string,
matched case-insensitively and trimmed. Roles with demand but no capacity appear
with a zero capacity line — deliberately, as the hiring signal.

## 5. The view

A mode on the existing Capacity page rather than a separate page, so supply and
demand stay in one place.

### The chart

- **Base of the stack** — committed work, from existing allocations
- **Above it** — planned demand, stacked by initiative
- **Single line** — available capacity, after leave

Where the stack crosses the line is the pressure point. Stacking planned on top
of committed answers the question that actually matters — does the pipeline fit
in what is *left* — rather than the weaker "does the pipeline exceed total
supply", which ignores work already underway.

### Controls

- date range and week/month bucket, shared with the existing view
- confidence filter — committed only, through to everything
- role filter — moves both the stack and the capacity line together
- group the stack by initiative, project or role

### The editor

Below the chart, an initiative → project → demand tree, editable inline. Adding
a demand row updates the chart immediately, so the question "what if this
initiative lands in March instead" is a two-second edit rather than a
spreadsheet.

## 6. Resolved questions

1. **Staffed demand** — linked to the real allocation via
   `fulfilledByRequestId`; the engine counts the person and skips the demand.
2. **Demand level** — projects only.
3. **Placement** — a mode on the existing Capacity page.
4. **Confidence** — filters only, never weights the FTE.

## 7. Impact on existing code

### 7.1 Must be updated

- `backend/src/routes/dataMigration.ts` — all three new models must be added to
  the export query, counts, payload, clear block and import, in FK order
  (Initiative → Project → RoleDemand). The file enumerates every model by hand,
  so anything omitted is silently dropped from every backup.
- `backend/src/lib/capacity.ts` — new input and output series.
- `backend/src/routes/capacity.ts` — new query params, wider payload.
- `frontend/src/pages/Capacity.tsx` — mode toggle, stack, editor.
- `frontend/src/types/index.ts`, `frontend/src/api/client.ts`.
- `practice app spec.md` — document the feature and the new models.

### 7.2 Deliberately left alone

- `WorkRequest` gains no parent link. Initiatives describe *planned* work;
  wiring existing requests into the hierarchy is a separate migration with its
  own decisions.
- `TeamMember.role` stays free text.

### 7.3 Migration

Three new tables, no changes to existing ones except the optional link from
`RoleDemand`. No table rebuilds, so no risk to existing rows.

## 8. Suggested build order

1. Schema and migration for the three models
2. Initiative / Project / RoleDemand CRUD API
3. Extend the capacity engine with planned demand
4. Extend the capacity API
5. `dataMigration` wiring
6. Frontend types and client
7. Capacity page mode toggle and chart
8. Initiative tree editor
9. Verify, document, backup round-trip
