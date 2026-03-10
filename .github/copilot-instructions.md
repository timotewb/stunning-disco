# Copilot Instructions

## Project Overview

**Practice Visualiser** — a local-first Docker-delivered web app for a practice lead to manage ~20 team members. Core features: skills matrices, project allocation timeline, SME tracking, capability coverage, and historical snapshot playback.

## Architecture

### Production (Docker)
Single container: Express backend on port 3000 serves both the REST API (`/api/*`) and the React frontend as static files from `./frontend/dist`.

### Development (local)
Two separate processes:
- Backend on `:3001` — Express + TypeScript + Prisma
- Frontend on `:5173` — Vite dev server that proxies `/api` → `http://localhost:3001`

### Directory Layout
```
practice_app/
  backend/         Express + TypeScript + Prisma
    src/
      index.ts     Entry point; mounts all routers
      routes/      One file per resource (team, dimensions, matrix, etc.)
    prisma/
      schema.prisma
  frontend/        React 18 + TypeScript + Vite + TailwindCSS
    src/
      api/client.ts  All API calls (axios, baseURL: /api)
      context/       SnapshotContext — global snapshot/playback state
      pages/         One file per route (Dashboard, Team, Matrices, etc.)
      components/    Layout, Sidebar, TimelineSlider
      types/index.ts Shared TypeScript interfaces
```

## Build & Dev Commands

### Backend
```bash
cd backend
npm install
npx prisma generate
npx prisma migrate deploy     # run migrations
PORT=3001 npm run dev         # ts-node-dev with hot reload
npm run build                 # tsc → dist/
```

### Frontend
```bash
cd frontend
npm install
npm run dev                   # Vite dev server on :5173
npm run build                 # tsc && vite build → dist/
```

### Docker
```bash
docker compose up --build     # first run
docker compose up             # subsequent runs
```
Migrations run automatically on container startup (`prisma migrate deploy && node dist/index.js`).

### Tests & Linting
There are no test files and no lint/format configuration in this project.

## Key Conventions

### Tags stored as JSON string
`TeamMember.tags` is stored in SQLite as a JSON string. Every backend route that reads or writes members must `JSON.parse(member.tags)` on read and `JSON.stringify(tags)` on write. See `backend/src/routes/team.ts`.

### Upsert semantics for matrix and SME
`MatrixEntry` has a unique constraint on `(teamMemberId, dimensionNodeId, snapshotId)` — always use `prisma.matrixEntry.upsert(...)`. Same for `SMEAssignment` which is unique on `(dimensionNodeId, snapshotId)`.

### Snapshot-scoped data
Matrix entries and SME assignments are always scoped to a `Snapshot`. The active snapshot is managed globally in `SnapshotContext` (`frontend/src/context/SnapshotContext.tsx`). All pages that display time-varying data should consume `useSnapshot()` to get `activeSnapshot`. On first load, `activeSnapshot` auto-initialises to the **last** snapshot in the list (most recent).

### DimensionNode hierarchy
`DimensionNode` is self-referential via `parentId`. Top-level nodes have `parentId: null`. The frontend recursively builds trees from flat arrays. `orderIndex` controls sibling ordering.

### Route/API structure
Each resource has a dedicated router file in `backend/src/routes/`. All routers create their own `PrismaClient` instance at module level. Frontend API calls are all centralised in `frontend/src/api/client.ts`.

The matrix router (`routes/matrix.ts`) is intentionally mounted at **two** paths in `index.ts`: `/api/matrix` (for GET queries) and `/api/matrix-entry` (for upsert/delete). Both point to the same router instance.

Route parameter IDs must always be cast to string: `const id = String(req.params.id)`.

### Database location
Development: set `DATABASE_URL=file:./prisma/dev.db` (or any local path).  
Production: `DATABASE_URL=file:/app/data/practice.db` (mounted Docker volume at `~/practice-data`).

### Frontend routing
React Router v6 with a single nested `<Route path="/" element={<Layout />}>` containing all page routes. Navigation: `/`, `/team`, `/matrices`, `/timeline`, `/capabilities`, `/settings`.

### Prisma schema targets
The schema specifies `binaryTargets = ["native", "linux-musl-openssl-3.0.x", "linux-musl-arm64-openssl-3.0.x"]` to support both local dev and Alpine Linux containers. Do not remove these targets.

### Allocation types
The `Allocation.type` field is a plain SQLite string but is typed in the frontend as `'project' | 'leave' | 'internal' | 'training'`. Backend validation is not enforced; keep frontend and backend in sync if types change.
