# Work Request Tracker — Design Recommendation

## Problem Statement

Work arrives constantly and from everywhere — a Slack message here, a Jira ticket there, a conversation in the corridor, a quarterly planning session. There is currently no single place to record, categorise, track, and retrospectively analyse *demand*. Without that record, it is impossible to see patterns in what is being asked of the team, correlate demand with capacity, or use historical data to inform future resourcing decisions.

This document proposes a **Demand Ledger** feature — a purposefully lightweight intake journal that sits *alongside* tools like Jira or Asana (not replacing them), acting as a single source of truth for *all* incoming work signals regardless of origin.

---

## Core Concept: The Demand Ledger

Think of this less like a task manager and more like a ship's log: every request that crosses your desk gets an entry. You record what was asked, where it came from, roughly how big it is, and how it was eventually resolved. Over time that log becomes a rich dataset for answering questions like:

- *How much unplanned work came in last quarter vs. this quarter?*
- *Which team members are absorbing the most ad-hoc requests?*
- *Which capability areas are being asked about most — and are we staffed for them?*
- *What proportion of demand originates from stakeholder conversations vs. formal planning?*
- *Which requests in my notes from last week haven't been formally logged yet?*

---

## Data Model

> **All taxonomies (source, type, priority, status, effort) are fully configurable in Settings** — the values listed below are defaults only. Users can add, rename, reorder, and colour-code entries for each taxonomy to match their organisation. Configuration follows the same pattern as the existing `AllocationTypeConfig` and `SeniorityConfig` models.

### `WorkRequest`

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Auto-generated |
| `title` | string | Short description of the request (required) |
| `description` | string? | Full context, pasted message, meeting notes, etc. |
| `source` | enum string | Origin channel — see Source taxonomy below |
| `sourceDetail` | string? | Free-text sub-channel (e.g. "#dev-support", "Q3 Planning session") |
| `type` | enum string | Nature of work — see Type taxonomy below |
| `priority` | enum string | `critical` / `high` / `medium` / `low` |
| `status` | enum string | Lifecycle stage — see Status workflow below |
| `effort` | enum string? | T-shirt size: `xs` / `s` / `m` / `l` / `xl` |
| `dateRaised` | date | When the request was *originally* made (may predate logging) |
| `dateLogged` | datetime | When this entry was created (auto-filled) |
| `dateResolved` | date? | When it was completed, deferred, or rejected |
| `requestorId` | FK → Contact? | Who raised the request — linked to the Contact directory |
| `assigneeId` | FK → TeamMember? | Which team member is handling it (optional) |
| `allocationType` | string? | How the work appears on the Timeline — sourced from `AllocationTypeConfig` (e.g. `project`, `leave`, `internal`, `training`). Required when `isAllocated` is true. |
| `isAllocated` | boolean | `true` when the work has been formally scheduled and should appear on the Timeline |
| `allocationStartDate` | date? | Start date on the Timeline. Required when `isAllocated` is true. |
| `allocationEndDate` | date? | End date on the Timeline. Required when `isAllocated` is true. |
| `allocationNotes` | string? | Scheduling-specific notes (separate from the request description) |
| `tags` | string[] | Reuses existing tag pattern (stored as JSON string) |
| `externalRef` | string? | Jira ID, Asana task link, Slack message permalink, etc. |
| `dimensionNodeIds` | string[] | Links to existing skill/capability nodes (stored as JSON array) — which capability areas does this request touch? |
| `noteRef` | string? | Folder slug + note date of the source note (e.g. `"daily-notes/2026-03-13"`) — populated when a request is extracted from Notes by the AI scanner |
| `isDraft` | boolean | `true` for AI-extracted requests awaiting human review; `false` once confirmed |
| `notes` | string? | Private notes, follow-up actions, context |
| `createdAt` | datetime | Row creation timestamp |
| `updatedAt` | datetime | Last modification timestamp |

### `Contact`

A lightweight directory of people and teams who raise requests. Intentionally minimal — designed to be extended as needs grow.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Auto-generated |
| `name` | string | Full name or team name (required) |
| `role` | string? | Job title or function (e.g. "Product Manager", "Delivery Lead") |
| `team` | string? | Organisational team or squad (e.g. "Platform", "Customer Success") |
| `email` | string? | Optional — for reference only, no emails are sent |
| `notes` | string? | Any useful context about this contact |
| `createdAt` | datetime | Row creation timestamp |
| `updatedAt` | datetime | Last modification timestamp |

Contacts are managed in Settings and are **not** the same as team members in the team directory — they represent external stakeholders, partner teams, or anyone outside the practice who originates work. A team member could also be a contact if they raise requests in a stakeholder capacity, but the two directories remain separate so the team directory is not polluted.



| Value | Label | Icon |
|-------|-------|------|
| `teams` | MS Teams | MessageSquare |
| `slack` | Slack | Hash |
| `jira` | Jira | Ticket |
| `asana` | Asana | CheckSquare |
| `call` | Phone/Video Call | Phone |
| `conversation` | In-person / Chat | Users |
| `planning` | Quarterly / Sprint Planning | Calendar |
| `email` | Email | Mail |
| `other` | Other | Inbox |

Sources are **configurable in Settings** (same pattern as `AllocationTypeConfig`) — users can add, rename, or colour-code sources to match their organisation.

### Type Taxonomy

| Value | Label |
|-------|-------|
| `feature` | New Feature / Enhancement |
| `bug` | Bug Fix |
| `consultation` | Advice / Consultation |
| `support` | Operational Support |
| `infrastructure` | Infrastructure / Platform |
| `planning` | Planning / Strategy |
| `research` | Research / Discovery |
| `other` | Other |

Types are **configurable in Settings**.

### Priority Taxonomy

| Value | Label | Default colour |
|-------|-------|----------------|
| `critical` | Critical | Red |
| `high` | High | Amber |
| `medium` | Medium | Indigo |
| `low` | Low | Gray |

Priorities are **configurable in Settings** — users can add levels (e.g. `urgent`), rename, and change colours.

### Effort Taxonomy

| Value | Label |
|-------|-------|
| `xs` | XS — hours |
| `s` | S — 1–2 days |
| `m` | M — up to a week |
| `l` | L — up to a month |
| `xl` | XL — multiple months |

Effort sizes are **configurable in Settings** — labels and values can be adjusted to match how the team estimates work (e.g. story points instead of t-shirt sizes).

### Status Workflow

```
draft → new → assessed → in-flight → resolved
                        ↘ deferred
                        ↘ rejected
```

| Status | Meaning |
|--------|---------|
| `draft` | AI-extracted from notes — awaiting human review and confirmation |
| `new` | Logged/confirmed but not yet evaluated |
| `assessed` | Reviewed, sized, and prioritised |
| `in-flight` | Being actively worked |
| `resolved` | Completed or handed off |
| `deferred` | Acknowledged but pushed to a later date |
| `rejected` | Declined / out of scope |

Status stages are **configurable in Settings** — teams can rename stages or add intermediate ones (e.g. `blocked`) to match their workflow.

When `isAllocated` is set to `true` on a request, the status is automatically advanced to `in-flight` if it was previously `new` or `assessed`.

---

## UI Design

### Navigation

A new **"Requests"** entry in the sidebar between Timeline and Capabilities, using the `Inbox` icon from Lucide React.

### Main View — Request Log

The primary view is a **searchable, filterable table** with these columns:

| Column | Notes |
|--------|-------|
| Date Raised | Sortable, formatted as relative time for recent entries |
| Title | Truncated with full text on hover; draft requests show a ✦ AI badge |
| Source | Colour-coded badge (uses configurable source colours) |
| Type | Badge |
| Priority | Coloured dot (critical=red, high=amber, medium=indigo, low=gray) |
| Status | Status badge; `draft` shown with a distinct amber outline style |
| Effort | T-shirt size badge |
| Assignee | Avatar/name chip |
| Allocation | Schedule chip showing assignee + date range when `isAllocated = true`; otherwise shows "— not yet scheduled" |
| External Ref | Clickable link if URL |

**Filters** (top bar):
- Source (multi-select)
- Type (multi-select)
- Priority (multi-select)
- Status (multi-select; a **"Drafts"** quick-filter button shows only AI-extracted pending review)
- Assignee (multi-select, from team members)
- Linked Allocation (scheduled / not yet scheduled / any)
- Date Raised range picker
- Free-text search (searches title, description, contact name/team, externalRef, tags)

**View toggle**: Table view ↔ Kanban view (columns = Status stages)

### Quick Capture

A **"+ New Request"** button in the top right opens a compact side panel (not a full-page modal) with:
- Title (required)
- Source (dropdown, remembers last used)
- Type (dropdown, remembers last used)
- Date Raised (defaults to today)
- Priority (defaults to medium)
- Expand link → reveals all optional fields

The side-panel stays open after save so you can log a batch of requests quickly (e.g. after a planning session).

### Allocation Section — Scheduling on the Timeline

Every work request has an **Allocation section** embedded in its edit panel. It is optional — a request exists and is tracked regardless of whether it is ever scheduled. When the allocation section is completed and the **"Allocate"** toggle is set, the request appears as a bar on the Timeline.

The allocation section contains:

| Field | Notes |
|-------|-------|
| Assignee | Who is doing the work (from team directory; defaults to request assignee if already set) |
| Allocation Type | Drives bar colour on the Timeline — sourced from `AllocationTypeConfig` (same configurable set used by the existing Timeline) |
| Start Date | When the work begins |
| End Date | When the work is expected to complete |
| Allocated | Toggle — when switched on, this request becomes visible on the Timeline |
| Allocation Notes | Optional scheduling context |

Setting **Allocated = on** requires Assignee, Start Date, End Date, and Allocation Type to be filled. The request status is automatically advanced to `in-flight`.

#### Timeline page behaviour

The Timeline page is a **Gantt visualisation layer** that reads directly from `WorkRequest` records where `isAllocated = true`. There is no longer a separate `Allocation` model — the WorkRequest IS the allocation.

- Bar label = request title
- Bar colour = `allocationType` colour from `AllocationTypeConfig`
- **Drag to resize** → updates `allocationEndDate`
- **Drag to move** → updates `allocationStartDate` and `allocationEndDate`
- **Click bar** → opens the WorkRequest detail/edit panel in a side panel
- **Drag to create** (on an empty lane for a team member) → opens the quick-capture panel with that team member pre-set as assignee, start/end dates pre-filled from the drag, and `isAllocated = true`
- Hovering a bar shows a tooltip with: request title, source, priority, type, requestor name + team

The lane-stacking algorithm, date range selector, and playback controls remain unchanged — they now operate on WorkRequest data instead of Allocation data.

> **Migration note:** Existing `Allocation` records are converted to `WorkRequest` records via a one-time migration script run at startup. The `Allocation` model is then deprecated and removed from the schema. Migrated records receive `source = "planning"`, `type = "other"`, `isDraft = false`, and `isAllocated = true` with dates and assignee carried over from the original record.

### AI-Assisted Capture (when Ollama is connected)

A **"Paste & Parse"** button opens a text area where you can drop in a raw Slack message, email excerpt, or meeting note. The AI (via the existing Ollama integration) extracts and pre-fills:
- A concise title
- Suggested type
- Suggested priority
- A cleaned-up description

The user reviews and confirms before saving. This dramatically lowers the friction of logging requests from conversations.

### AI Notes Scanner (when Ollama is connected)

The most proactive capture mechanism. The Notes system already holds daily journal entries, meeting notes, and folder-based records. The AI scanner turns that existing content into structured work requests automatically.

#### How it works

1. **Scheduled scan** — A **"Scan Notes"** button (or optional automatic scan on app load) sends recent note content to Ollama with a structured extraction prompt.
2. **Extraction prompt** — The prompt instructs the model to identify any passage that describes an incoming request, ask, action item, or piece of work asked of the team, and return a JSON array of candidate requests with suggested title, source, type, priority, and a verbatim excerpt as evidence.
3. **Draft creation** — Each extracted candidate is saved as a `WorkRequest` with `isDraft: true`, `status: "draft"`, and `noteRef` pointing to the originating note (folder + date). Duplicates are suppressed: if a note has already been scanned (tracked by `noteRef`), it is skipped.
4. **Review queue** — A persistent amber banner on the Requests page shows *"X draft requests extracted from your notes — review now"*. Clicking opens a focused **Draft Review** view.

#### Draft Review view

A step-through interface (not a table) — one draft at a time, showing:

- The **verbatim excerpt** from the note (so the user can see exactly what the AI found)
- The AI-suggested field values
- Inline editable fields for title, source, type, priority, effort, assignee
- Three actions: **Confirm** (promote to `new`), **Edit then Confirm**, **Discard**

After review the draft is either a proper `new` request or deleted. The source note is unmodified.

#### Scan scope controls (in Settings)

- Which note folders to include/exclude from scanning
- Lookback window (default: last 7 days; configurable)
- Whether to scan automatically on app load or only on demand

#### Extraction prompt shape

```
You are a work request extractor. Read the following notes and identify any passages 
where someone describes incoming work, a request made of the team, an action item 
assigned to us, or a problem to solve. For each one, return a JSON object with:
  title: string (concise, ≤10 words)
  excerpt: string (verbatim quote from the note, ≤200 chars)
  suggestedSource: one of [teams, slack, jira, asana, call, conversation, planning, email, other]
  suggestedType: one of [feature, bug, consultation, support, infrastructure, planning, research, other]
  suggestedPriority: one of [critical, high, medium, low]
Return only a JSON array. If nothing qualifies, return [].

Notes:
{noteContent}
```

---

## Analytics View

A second tab on the Requests page: **"Demand Analytics"**

### 1. Volume Over Time

A **stacked bar chart** (week-by-week or month-by-month, user selectable) showing request count broken down by:
- Source colour (default) — or switch to Type or Priority breakdown

This immediately reveals seasonal spikes, quarter-end surges, and periods of calm.

### 2. Source & Type Breakdown

Side-by-side **donut charts**:
- Left: requests by source
- Right: requests by type

Clicking a segment filters the request log.

### 3. Resolution Funnel

A **funnel / Sankey-style chart** showing how requests move through statuses:
- How many land in `new` vs. get assessed vs. resolved vs. deferred/rejected
- Average time in each status (dwell time)

This surfaces bottlenecks — e.g., requests piling up in `assessed` because there's no capacity to act.

### 4. Skills Pressure Map *(Novel integration)*

This is the most powerful insight: **overlay request `dimensionNodeIds` with the existing capability matrix**.

When logging a request you tag which capability areas it requires (e.g., "Cloud Architecture", "Data Engineering"). The Skills Pressure Map then shows:

- For each capability node in the dimension tree: **how many open/in-flight requests require it**
- Colour-coded overlay on the existing heatmap: green (low demand) → amber (moderate) → red (high demand relative to team coverage)

This creates a direct visual link between *what people are being asked to do* and *whether the team has the skills to do it* — the key input for resourcing decisions.

### 5. Assignee Load

A **horizontal bar chart** per team member showing:
- Count of in-flight requests broken down by priority
- Solid segments = scheduled on the Timeline (`isAllocated = true`)
- Hollow/hatched segments = in-flight but not yet scheduled
- Hovering shows the request titles

This makes it immediately visible who has work piling up that hasn't been formally put on the calendar.

### 6. Quarter-on-Quarter Comparison

A simple **grouped bar chart** comparing demand totals by quarter, filterable by source or type. Enables the practice lead to tell a story: "demand from ad-hoc conversations has grown 40% quarter-on-quarter while our team size has stayed flat."

---

## Integration with Existing Features

| Existing Feature | Integration Point |
|-----------------|------------------|
| **Team Members** | `assigneeId` FK for both request ownership and timeline scheduling |
| **Dimension Nodes** | `dimensionNodeIds` array; Skills Pressure Map |
| **Timeline** | **Fully merged** — the Timeline page now renders WorkRequests where `isAllocated = true` instead of the deprecated `Allocation` model. All existing Timeline interactions (drag-resize, drag-move, drag-create, lane stacking) operate on WorkRequest data. `AllocationTypeConfig` is retained and drives bar colours. |
| **Allocation model** | **Deprecated** — replaced by the allocation section embedded in WorkRequest. Existing records migrated on first startup. |
| **Snapshots** | Requests are *not* snapshot-scoped (they are longitudinal by design). The date range filter on the Timeline achieves the same time-slicing effect. |
| **Notes** | AI scanner reads note folders and extracts draft requests; `noteRef` field traces each draft back to its source note; clicking `noteRef` in the request panel opens the originating note |
| **AI / Ollama** | Paste & Parse for manual capture; Notes Scanner for automatic extraction; both use the same Ollama connection configured in Settings |
| **Settings** | Configure all taxonomies (source, type, priority, status, effort) with names and colours; manage Contact directory; `AllocationTypeConfig` retained for Timeline bar colours; configure Notes Scanner scope and lookback window; manage AI extraction prompt template |
| **Export** | Export request log as CSV; export Timeline and analytics views as PNG/PDF |

---

## Backend Implementation

### New Prisma Model

```prisma
model WorkRequest {
  id                  String      @id @default(uuid())
  title               String
  description         String?
  source              String
  sourceDetail        String?
  type                String
  priority            String      @default("medium")
  status              String      @default("new")
  isDraft             Boolean     @default(false)
  effort              String?
  dateRaised          DateTime
  dateResolved        DateTime?
  requestorId         String?
  requestor           Contact?    @relation(fields: [requestorId], references: [id], onDelete: SetNull)
  assigneeId          String?
  assignee            TeamMember? @relation("RequestAssignee", fields: [assigneeId], references: [id], onDelete: SetNull)
  // Allocation section — populated when the request is scheduled on the Timeline
  isAllocated         Boolean     @default(false)
  allocationType      String?     // sourced from AllocationTypeConfig; drives bar colour
  allocationStartDate DateTime?
  allocationEndDate   DateTime?
  allocationNotes     String?
  // Capture metadata
  noteRef             String?     // "folderSlug/noteDate" — set when created by AI Notes Scanner
  tags                String      @default("[]")
  externalRef         String?
  dimensionNodeIds    String      @default("[]")
  notes               String?
  createdAt           DateTime    @default(now())
  updatedAt           DateTime    @updatedAt

  @@index([isAllocated, allocationStartDate, allocationEndDate]) // Timeline query performance
  @@index([assigneeId, isAllocated])
}

// The existing Allocation model is DEPRECATED.
// It is replaced by the allocation section on WorkRequest.
// A migration script converts all existing Allocation rows to WorkRequest rows on first run.
// AllocationTypeConfig is retained — it drives allocationType colours on the Timeline.

model Contact {
  id           String        @id @default(uuid())
  name         String
  role         String?
  team         String?
  email        String?
  notes        String?
  requests     WorkRequest[]
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
}

model RequestSourceConfig {
  id        String   @id @default(uuid())
  name      String   @unique
  color     String
  createdAt DateTime @default(now())
}

model RequestTypeConfig {
  id        String   @id @default(uuid())
  name      String   @unique
  color     String
  createdAt DateTime @default(now())
}

model RequestPriorityConfig {
  id         String   @id @default(uuid())
  name       String   @unique
  color      String
  orderIndex Int      @default(0)
  createdAt  DateTime @default(now())
}

model RequestStatusConfig {
  id         String   @id @default(uuid())
  name       String   @unique
  color      String
  orderIndex Int      @default(0)
  createdAt  DateTime @default(now())
}

model RequestEffortConfig {
  id         String   @id @default(uuid())
  name       String   @unique   // display label, e.g. "S — 1-2 days"
  value      String   @unique   // stored value, e.g. "s"
  orderIndex Int      @default(0)
  createdAt  DateTime @default(now())
}
```

### New API Routes — `/api/requests`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/requests` | List with filter params: `source`, `type`, `priority`, `status`, `isDraft`, `assigneeId`, `isAllocated`, `from` / `to` (filter by `allocationStartDate` range for Timeline queries), `raisedFrom` / `raisedTo` (filter by `dateRaised`), `q` (search) |
| POST | `/api/requests` | Create |
| PUT | `/api/requests/:id` | Update — when `isAllocated` is set to `true`, backend validates allocation fields and auto-advances status to `in-flight` if applicable |
| DELETE | `/api/requests/:id` | Delete |
| GET | `/api/requests/analytics` | Aggregated analytics data (volume over time, breakdowns) |
| POST | `/api/requests/parse` | AI-assisted parse from pasted text (proxies to Ollama, returns structured suggestion) |
| POST | `/api/requests/scan-notes` | AI Notes Scanner — accepts `{ folders, fromDate }`, scans note content via Ollama, creates draft WorkRequests, returns count of new drafts created |
| GET | `/api/contacts` | List contacts; supports `q` search (name, role, team) |
| POST | `/api/contacts` | Create contact |
| PUT | `/api/contacts/:id` | Update contact |
| DELETE | `/api/contacts/:id` | Delete contact (sets `requestorId` to null on any linked requests) |
| GET | `/api/request-source-config` | List configured sources |
| POST | `/api/request-source-config` | Create source config |
| DELETE | `/api/request-source-config/:id` | Delete |
| GET | `/api/request-type-config` | List configured types |
| POST | `/api/request-type-config` | Create type config |
| DELETE | `/api/request-type-config/:id` | Delete |
| GET | `/api/request-priority-config` | List configured priorities |
| POST | `/api/request-priority-config` | Create priority config |
| DELETE | `/api/request-priority-config/:id` | Delete |
| GET | `/api/request-status-config` | List configured statuses |
| POST | `/api/request-status-config` | Create status config |
| DELETE | `/api/request-status-config/:id` | Delete |
| GET | `/api/request-effort-config` | List configured effort sizes |
| POST | `/api/request-effort-config` | Create effort config |
| DELETE | `/api/request-effort-config/:id` | Delete |

The existing `/api/allocations` routes are **deprecated**. The Timeline page migrates to `GET /api/requests?isAllocated=true&from=X&to=Y`. The existing allocation-type config routes (`/api/allocation-types`) are retained unchanged.

### Analytics Endpoint Response Shape

The `GET /api/requests/analytics` endpoint accepts `from`, `to`, `groupBy` (`week` / `month`) query params and returns:

```json
{
  "volumeOverTime": [
    { "period": "2025-Q1", "total": 23, "bySource": { "teams": 8, "slack": 6, "planning": 9 } }
  ],
  "bySource": [{ "source": "teams", "count": 42 }],
  "byType": [{ "type": "feature", "count": 18 }],
  "byStatus": [{ "status": "resolved", "count": 30 }],
  "skillsPressure": [
    { "dimensionNodeId": "abc", "name": "Cloud Architecture", "openCount": 7 }
  ],
  "assigneeLoad": [
    { "assigneeId": "xyz", "name": "Alice", "inFlightCount": 4, "byPriority": { "high": 2, "medium": 2 } }
  ],
  "medianDwellDays": { "new": 2, "assessed": 5, "inFlight": 14 }
}
```

---

## Frontend Implementation

### New Files

```
frontend/src/
  pages/
    Requests.tsx          # Main page (table + analytics tab + draft review)
    Timeline.tsx          # Existing page — updated to read from WorkRequest (isAllocated=true)
  components/
    RequestForm.tsx       # Side-panel for capture/edit — includes embedded allocation section
    RequestDraftReview.tsx # Step-through draft review view with note excerpt
    RequestKanban.tsx     # Kanban board view
    DemandCharts.tsx      # Analytics charts (Recharts)
    SkillsPressureMap.tsx # Dimension tree with demand overlay
```

### New Types

```typescript
interface WorkRequest {
  id: string;
  title: string;
  description?: string;
  source: string;
  sourceDetail?: string;
  type: string;
  priority: string;             // driven by RequestPriorityConfig
  status: string;               // driven by RequestStatusConfig
  isDraft: boolean;
  effort?: string;              // driven by RequestEffortConfig
  dateRaised: string;
  dateResolved?: string;
  requestorId?: string;
  requestor?: Contact;
  assigneeId?: string;
  assignee?: TeamMember;
  // Allocation section
  isAllocated: boolean;
  allocationType?: string;      // from AllocationTypeConfig; drives Timeline bar colour
  allocationStartDate?: string;
  allocationEndDate?: string;
  allocationNotes?: string;
  // Capture metadata
  noteRef?: string;
  tags: string[];
  externalRef?: string;
  dimensionNodeIds: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// The existing Allocation interface is deprecated.
// The existing AllocationTypeConfig interface is retained (drives allocationType colours).

interface NotesScanResult {
  draftsCreated: number;
  skippedAlreadyScanned: number;
  notesScanned: number;
}

interface RequestSourceConfig   { id: string; name: string; color: string; createdAt: string; }
interface RequestTypeConfig     { id: string; name: string; color: string; createdAt: string; }
interface RequestPriorityConfig { id: string; name: string; color: string; orderIndex: number; createdAt: string; }
interface RequestStatusConfig   { id: string; name: string; color: string; orderIndex: number; createdAt: string; }
interface RequestEffortConfig   { id: string; name: string; value: string; orderIndex: number; createdAt: string; }

interface Contact {
  id: string;
  name: string;
  role?: string;
  team?: string;
  email?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface RequestAnalytics {
  volumeOverTime: VolumePoint[];
  bySource: { source: string; count: number }[];
  byType: { type: string; count: number }[];
  byStatus: { status: string; count: number }[];
  skillsPressure: { dimensionNodeId: string; name: string; openCount: number }[];
  assigneeLoad: { assigneeId: string; name: string; inFlightCount: number; byPriority: Record<string, number> }[];
  medianDwellDays: Record<string, number>;
}
```

---

## What Makes This Novel

Most request/ticket systems are designed to *manage* work. This is designed to *understand* demand. The key differentiators:

1. **Multi-source intake as a first-class concept.** The source field is not a tag — it is a dimension of the data, configurable, colour-coded, and used as a primary lens in analytics. Most tools assume a single intake channel.

2. **Skills Pressure Map.** Linking requests to the existing capability matrix creates an insight no standalone tool offers: *we are being asked to do things we do not have enough people skilled to do*. This is the direct bridge from demand tracking to resourcing decisions.

3. **Longitudinal by design.** Requests are never snapshot-scoped. They accumulate over months and years, creating a growing dataset that makes the analytics more valuable over time. Quarter-on-quarter comparison becomes genuinely useful after two to three quarters of data.

4. **Friction-minimised capture.** The quick-capture side panel, the "remember last used" source/type defaults, and the AI paste-and-parse feature are all designed around the real-world scenario of logging five requests after a planning meeting in under two minutes.

5. **AI Notes Scanner as passive capture.** Rather than requiring discipline to log every request manually, the scanner reads your existing daily notes and surfaces candidates automatically. You review and confirm — you never need to log something twice or remember to log it at all if you already wrote about it.

6. **Unified demand-to-delivery model.** The WorkRequest IS the allocation — there is no separate scheduling object. A request moves from intake through assessment to the Timeline simply by filling in three fields and flipping a toggle. This eliminates the dual-entry problem (log the request *and* create a separate allocation) and means every bar on the Timeline carries its full demand context: where the work came from, why it was prioritised, and who asked for it.

7. **Integrated, not siloed.** Because requests link to team members, capability nodes, allocations, and notes, you can answer questions like "Alice has three high-priority in-flight requests and is allocated at 80% to Project X — is that sustainable?" without leaving the app.

---

## Implementation Phases

### Phase 0 — Migration (prerequisite)
- Write and test migration script: convert existing `Allocation` rows → `WorkRequest` rows (set `isAllocated = true`, carry over `teamMemberId` → `assigneeId`, `type` → `allocationType`, `startDate`, `endDate`, `projectName` → `title`, `notes` → `allocationNotes`, `source = "planning"`)
- Update Timeline page data source from `GET /api/allocations` → `GET /api/requests?isAllocated=true`
- Verify visual parity with the existing Timeline before proceeding

### Phase 1 — Core Capture & Log
- Prisma model + migration for `WorkRequest` (including all allocation fields)
- CRUD API routes for WorkRequest
- Request log page (table, filters, search, Drafts quick-filter)
- Quick capture side panel with embedded allocation section
- Contact directory (Settings): create/edit/delete contacts; inline "create new contact" option when picking a requestor
- Settings: configure all five taxonomies (source, type, priority, status, effort) with names and colours
- Deprecate `/api/allocations` routes (keep temporarily for backward compatibility during migration)

### Phase 2 — Analytics
- Analytics API endpoint with aggregations
- Volume over time chart
- Source and type breakdown charts
- Assignee load chart (scheduled vs. unscheduled in-flight segments)

### Phase 3 — AI & Deep Integration
- AI Paste & Parse (Ollama integration)
- AI Notes Scanner: scan endpoint, draft creation, `noteRef` deduplication
- Draft Review step-through UI with note excerpt display
- Settings: Notes Scanner scope and lookback window configuration
- Skills Pressure Map (link to dimension nodes)
- Export (CSV download, PNG/PDF charts)
- Kanban view toggle
- Resolution funnel / dwell time metrics
- Remove deprecated `Allocation` model and routes

---

## Open Questions

1. **Should `dateRaised` default to today or be required?** — Defaulting to today reduces friction. Requiring it ensures accuracy for historical reporting.
   > Date shoudl default to today l(local time) however it should be modifiable (e.g. to back date)

2. **Bulk import from CSV** — Useful for back-filling historical requests from an existing spreadsheet. Would need a CSV import UI in Settings.
   > not required

3. **Should anonymous/external requestors be linked to a `Contact` model?** — **Resolved: yes.** The `Contact` model (name, role, team, email, notes) replaces the free-text `requestor` field. Managed in Settings; extensible for future needs such as organisation, phone, or stakeholder tier.
   > This has been documented above

4. **Notes Scanner: push or pull notifications?** — Currently designed as on-demand. A future option could trigger the scan automatically whenever a note is saved, surfacing a toast notification when new drafts are found.
   > Keep as on-demand for now.

5. **Should the AI extraction prompt be user-editable?** — The Notes system already has configurable AI prompts (stored in the `ai` settings). The extraction prompt template could follow the same pattern, allowing customisation for different team contexts.
   > Yes it should follow existing standards, i.e. it should be modifiable.
