Version: 1.0
Date: March 2026

---

1. Overview

1.1 Purpose

The purpose of this tool is to provide a local‑first, interactive web application that allows a practice lead to visualise and manage a team of approximately 20 members.

The tool will provide high‑level visibility of:
- team capabilities
- skills distribution
- subject matter experts
- project allocation
- leave
- capability coverage
- changes over time

The application does not replace delivery tools (such as Jira). It provides a leadership‑level overview only.

---

1.2 Key Objectives

The application should allow the user to:

- understand who is in the team
- understand what they are skilled in
- identify subject matter experts
- view project allocation over time
- understand team capability coverage
- visually explain the team structure to others

All data should support **historical playback** so the user can press play and see how the team evolved over time.

---

2. Core Principles

2.1 Local‑First Data

All data must remain on the user's laptop.

Requirements:

- No cloud services
- No external APIs
- No telemetry

All data must be stored in a local persistent data volume.

---

2.2 Docker Delivery

The application must be delivered as a Docker container.

Example startup:

```
docker run -p 3000:3000 -v ~/practice-data:/app/data practice-visualiser
```

Requirements:

- persistent data stored in mounted volume
- container stateless except for mounted data
- single container preferred

---

2.3 Interactive Web Application

The application must behave like a modern web app.

Requirements:

- dynamic navigation
- inline editing
- drag and drop interactions
- responsive UI
- no page reloads

All data editing must be done through the UI.

---

2.4 Minimalist Design

Design goals:

- minimalist
- simple
- visually clear

Default theme:

- monochrome palette
- light grey backgrounds
- dark text
- one or two configurable accent colours

---

3. Team Directory

Purpose:

Maintain the list of team members.

Fields:

- id (UUID)
- name
- role
- seniority
- tags
- notes
- createdAt

Features:

- add team member
- edit member
- delete member
- search
- tag filtering

---

4. Configurable Dimensions

The system must support custom dimensions used in matrices.

Examples:

- Skills
- Technologies
- Capabilities
- Responsibilities
- Certifications

---

4.1 Hierarchical Dimensions

Dimensions must support an optional hierarchical structure.

Example hierarchy:

Skill
  Coding
    Language
      Java
      Python
    Speciality
      Backend
      Data Engineering
  Architecture
    Solution Architecture
    Integration Architecture

Requirements:

- support at least 4 hierarchy levels
- editable via UI
- reorderable nodes
- optional ratings on nodes

Matrix Behaviour:

- matrix initially shows top level
- users can expand nodes
- parent nodes may display aggregated ratings

Interaction:

- expand / collapse
- drill‑down navigation
- breadcrumb navigation

Hierarchy support is optional per dimension.

---

5. Matrix Visualisation

Purpose:

Display Team Member vs Dimension Values.

Example:

Person | AWS | React | Java
Alice | 4 | 3 | 4
Bob | 2 | 5 | 3

---

5.1 Rating Scale

Default:

0 None
1 Basic
2 Intermediate
3 Advanced
4 Expert

---

5.2 Visual Style

Cells displayed as heatmap colours.

Higher skill = darker colour.

---

5.3 Interaction

Users can:

- click cells to edit
- filter rows
- filter columns
- collapse unused columns

---

6. Time‑Based Model

All views must support time evolution.

---

6.1 Snapshot Model

Snapshots represent historical states.

Example:

2026‑01‑01
2026‑01‑08
2026‑01‑15

Snapshots store:

- matrix entries
- SME assignments
- allocations

---

6.2 Time Navigation

The UI must include a timeline slider.

Users can:

- drag timeline
- select snapshot
- play history

Playback speeds:

- 1x
- 2x
- 5x

---

7. Project Allocation Timeline

Fields:

- id
- teamMemberId
- projectName
- type
- startDate
- endDate
- notes

Types:

- project
- leave
- internal
- training

Interactions:

- drag to create
- resize
- edit label

---

8. SME View

Purpose:

Track subject matter experts.

Example:

Capability | SME | Backup
Cloud | Alice | Bob
Architecture | Carol | Alice

Features:

- assign SME
- assign backup SME

---

9. Capability Coverage

Visual capability strength summary.

Example:

Architecture █████
Cloud ████
Security ██
Integration ███

---

9.1 Capacity Over Time

Answers two questions: what capacity does the team have, and how much is
already committed against it.

Capacity is measured in FTE, where 1.0 is full time. Hours are a display
convenience only, derived from a configurable hours-per-FTE value.

Inputs:

- baselineFte — a member's standing FTE
- startDate / endDate — bounds when a member counts toward capacity
- CapacityChange — a dated override of baselineFte
- leave — allocations whose type is marked "reduces capacity"
- allocationFte — the share of a person's capacity an allocation consumes
- public holidays

Capacity changes:

A change has an effectiveFrom and an optional effectiveTo. Leaving
effectiveTo blank makes the change permanent. Setting it makes the change
temporary — capacity reverts automatically afterwards, so a fixed-term
reduction is a single record rather than a pair of step changes.

Where several changes overlap a day, the one with the latest effectiveFrom
wins. This lets a short-term reduction sit inside a longer-term one and
unwind correctly.

Public holidays:

Holidays are working days with zero capacity, not excluded days. Excluding
them would shrink the working week and hide the dip entirely. Committed work
is zeroed on holidays too, otherwise every holiday week would manufacture
phantom overcommitment.

Seeded with New Zealand national holidays. Regional anniversary days and
company closedowns are added by the user.

Derived figures, per bucket:

capacity   sum of effective FTE across working days
leave      capacity consumed by leave allocations
available  capacity − leave
committed  demand from allocations, excluding leave
headroom   available − committed

Buckets are weekly or monthly and are clipped to the requested range, so a
part-week at either edge averages only over the days actually requested.

Views:

- totals for today
- a chart of available capacity against committed work
- grouping by role, seniority, or tag
- a breakdown table
- warnings for overcommitted periods and for leavers with no end date

---

9.2 Demand Planning

Answers the forward question: what will the pipeline ask of the team, and
when does that ask overtake what the team can actually deliver.

Capacity planning (9.1) only sees work that is already allocated to a named
person. Work that is merely anticipated has nobody attached to it, so it
contributes nothing — which is precisely the work that causes future
pressure. Demand planning fills that gap.

Model:

    Initiative -> Project -> RoleDemand

- Initiative — a programme of work, with a confidence of candidate,
  probable, or committed
- Project — a deliverable within an initiative
- RoleDemand — "this much of this role, for this window"

Role demand attaches to projects only, never directly to initiatives, so
there is exactly one place to look for any given number. An initiative with
a single same-named project covers the case where that distinction does not
matter.

Two different kinds of FTE:

RoleDemand.fte is absolute — 2.0 means two full-time people. An allocation's
allocationFte is a fraction of one named person's capacity, so a 0.6 FTE
member fully allocated contributes 0.6. The two are different quantities and
are computed separately.

Roles are free text:

Forward planning includes roles the team does not employ yet. Demand of
3.0 FTE for a role with zero capacity is the hiring signal the view exists
to surface, so the field is never constrained to the current team. Existing
roles are offered as autocomplete suggestions.

Confidence filters, it never weights:

Confidence selects which initiatives are shown. It does not scale their FTE.
A blended "we need 1.4 engineers" is not actionable, and the arithmetic
hides which initiative drove the number.

Staffing a demand:

Setting fulfilledByRequestId links a demand to a real, allocated work
request. The engine then counts that person's allocation and skips the
demand, so the original plan stays visible without being counted twice.
Linking a request that is not actually allocated is rejected, because the
demand would silently vanish from the forecast with nothing replacing it.

Holidays:

Planned demand is zeroed on holidays and excluded at weekends, exactly as
capacity is. Dipping only one side of the comparison would invent pressure
in every holiday week.

Derived figures, per bucket:

planned    unstaffed demand from the pipeline, in absolute FTE
total ask  committed + planned
headroom   available - committed - planned

A bucket is "under pressure" when the total ask exceeds available capacity.

View:

A Planning mode on the Capacity page, not a separate page — the comparison
is only meaningful against the capacity figures already shown there. The
chart stacks committed work at the base with each initiative above it, and
overlays a single line for available capacity. Where the stack crosses the
line is a pressure point.

Planning mode fixes grouping to the whole team, since the point is one ask
against one capacity line; a role filter narrows the picture instead.

---

10. Exporting Visuals

Export formats:

- PNG
- SVG
- PDF

Exportable views:

- matrices
- timeline
- capability charts
- SME table

---

11. User Interface Structure

Main navigation:

Dashboard
Team
Matrices
Timeline
Capabilities
Capacity
Settings

---

11.1 Dashboard

Displays:

- team size
- active projects
- capability coverage
- allocation summary

---

11.2 Matrices

Users can create multiple matrices.

Examples:

Skills Matrix
Technology Matrix
Capability Matrix

Configuration:

Rows: Team Members
Columns: Dimension Values

---

11.3 UI Wireframes (Conceptual)

Dashboard

+--------------------------------------------------+
| Dashboard                                        |
|--------------------------------------------------|
| Team Size: 20 | Active Projects: 5 | SMEs: 8     |
|--------------------------------------------------|
| Capability Coverage                              |
| Architecture  █████                              |
| Cloud         ████                               |
| Security      ██                                 |
| Integration   ███                                |
|--------------------------------------------------|
| Allocation Timeline                              |
| Alice | Project A | Leave | Project B            |
| Bob   | Project B | Project B                    |
+--------------------------------------------------+

Team Directory

+--------------------------------------------------+
| Team                                             |
| Search [________]                                |
|--------------------------------------------------|
| Alice Wong | Senior Engineer                     |
| Bob Smith  | Engineer                            |
+--------------------------------------------------+

Matrix

+--------------------------------------------------+
| Skills Matrix                                    |
| Filter: Skill  Snapshot: Week  ▶ Play            |
|--------------------------------------------------|
| Person | Coding | Architecture | Cloud           |
| Alice  | 4      | 3            | 4                |
| Bob    | 3      | 2            | 2                |
+--------------------------------------------------+

Timeline

+--------------------------------------------------+
| Timeline Q1 2026                                 |
| Alice | ███ Project A ███ | Leave | Project B    |
| Bob   | █████████ Project B ███████               |
+--------------------------------------------------+

Interaction Expectations

- inline editing
- drag timeline allocations
- expandable matrices
- timeline playback controls

---

12. Database Schema (Conceptual)

Database: SQLite
ORM: Prisma

TeamMember

- id
- name
- role
- seniority
- notes
- baselineFte
- startDate
- endDate
- createdAt

CapacityChange

- id
- teamMemberId
- effectiveFrom
- effectiveTo (null = permanent)
- fte
- reason

Holiday

- id
- name
- date

Initiative

- id
- name
- description
- confidence (candidate | probable | committed)
- color
- orderIndex

Project

- id
- initiativeId
- name
- notes
- startDate (optional)
- endDate (optional)
- orderIndex

RoleDemand

- id
- projectId
- role (free text)
- seniority (optional)
- fte (absolute, not a fraction of a person)
- startDate
- endDate
- notes
- fulfilledByRequestId (optional; when set, the engine skips this row)

Dimension

- id
- name
- type
- description

DimensionNode

- id
- dimensionId
- parentId
- name
- orderIndex

MatrixEntry

- id
- teamMemberId
- dimensionNodeId
- snapshotId
- value

Snapshot

- id
- timestamp
- label

Allocation

- id
- teamMemberId
- projectName
- type
- allocationFte
- startDate
- endDate
- notes

SMEAssignment

- id
- dimensionNodeId
- primaryMemberId
- backupMemberId
- snapshotId

Relationships

TeamMember 1‑N MatrixEntry
Dimension 1‑N DimensionNode
DimensionNode 1‑N MatrixEntry
Snapshot 1‑N MatrixEntry
TeamMember 1‑N Allocation
TeamMember 1‑N CapacityChange
DimensionNode 1‑N SMEAssignment
Initiative 1‑N Project
Project 1‑N RoleDemand
WorkRequest 1‑N RoleDemand (fulfilment link)

---

12B. API Endpoint Definitions

Base URL

http://localhost:3000/api

All responses JSON.

Team

GET /team
POST /team
PUT /team/{id}
DELETE /team/{id}

Dimensions

GET /dimensions
POST /dimensions
PUT /dimensions/{id}
DELETE /dimensions/{id}

Dimension Nodes

GET /dimensions/{id}/nodes
POST /dimension-nodes
PUT /dimension-nodes/{id}
DELETE /dimension-nodes/{id}

Snapshots

GET /snapshots
POST /snapshots
DELETE /snapshots/{id}

Matrix

GET /matrix?dimensionId=&snapshotId=
POST /matrix-entry
DELETE /matrix-entry/{id}

Allocations

GET /allocations
POST /allocations
PUT /allocations/{id}
DELETE /allocations/{id}

SME

GET /sme
POST /sme
DELETE /sme/{id}

Capacity

GET /capacity?from=&to=&bucket=&groupBy=&confidence=&role=
GET /capacity/config
PUT /capacity/config
GET /capacity/undated-leavers
GET /capacity/changes/{memberId}
POST /capacity/changes
PUT /capacity/changes/{id}
DELETE /capacity/changes/{id}

Initiatives, projects and role demand

GET /initiatives
POST /initiatives
PUT /initiatives/{id}
DELETE /initiatives/{id}
POST /initiatives/projects
PUT /initiatives/projects/{id}
DELETE /initiatives/projects/{id}
POST /initiatives/demands
PUT /initiatives/demands/{id}
DELETE /initiatives/demands/{id}
GET /initiatives/roles

Holidays

GET /holidays
POST /holidays
PUT /holidays/{id}
DELETE /holidays/{id}

Export

GET /export/matrix
GET /export/timeline
GET /export/capabilities

---

13. Data Storage

Database stored locally.

Location:

/app/data/practice.db

Mounted via Docker volume.

---

14. Technical Architecture

Frontend

React
TypeScript
Vite
TailwindCSS

Libraries

TanStack Table
D3 or Recharts

Backend

Node.js
Express

Database

SQLite
Prisma ORM

Container

Docker

Single container containing:

frontend
backend
database

---

15. Performance Requirements

Target scale:

20 team members
50‑100 skills
5+ years history

Requirements:

load time < 2 seconds
smooth playback
instant edits

---

16. Security

Requirements:

no internet access
no telemetry
local only

Optional:

password protection

---

17. Developer Deliverables

1 Docker Image

Build via docker build

2 Startup instructions

docker compose up

3 Source code repository

frontend
backend
database schema
docker config

4 Documentation

setup
backup
upgrade

---

18. Backup Strategy

Database file:

practice.db

Backup by copying the SQLite file.

---

19. Future Enhancements

scenario planning
skill gap analysis
organisation chart
hiring forecast

---

20. Acceptance Criteria

Application runs locally via Docker
Data persists between restarts
Team editable via UI
Matrices editable
Timeline works
Playback works
Visual export works
No internet connection required