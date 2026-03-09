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
- createdAt

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
DimensionNode 1‑N SMEAssignment

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
capacity planning
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