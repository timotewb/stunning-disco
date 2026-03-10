# kaimahi

A local-first interactive web app for a practice lead to manage ~20 team members. Features skills matrices, project allocation timeline, SME tracking, capability coverage, and historical playback.

## Overview

- **Skills Matrices**: Track team member proficiency across configurable dimensions with historical snapshots
- **Project Allocation Timeline**: Gantt-style view of project, leave, training and internal allocations
- **SME Tracking**: Assign primary and backup subject matter experts per capability
- **Capability Coverage**: Visual coverage of team skills via charts and heatmaps
- **Historical Playback**: Replay snapshots over time to see team evolution

## Quick Start

```bash
docker compose up
```

Then open http://localhost:3000 in your browser.

## First Time Setup

1. Clone or download this repository
2. Run `docker compose up --build`
3. The database is automatically created on first run at `~/practice-data/practice.db`
4. Navigate to **Settings** to configure your dimensions (skill categories)
5. Navigate to **Team** to add your team members
6. Create a snapshot in **Matrices** and start rating your team

## Backup

Your data is stored at `~/practice-data/practice.db`. To back it up:

```bash
cp ~/practice-data/practice.db ~/practice-data/practice.db.bak
```

Or copy the file to any safe location. The SQLite file is fully self-contained.

## Upgrade

```bash
docker compose pull
docker compose up --build
```

Database migrations run automatically on startup.

## Development Setup

### Backend

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
PORT=3001 npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server runs on http://localhost:5173 and proxies `/api` requests to the backend at http://localhost:3001.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS + TanStack Table + Recharts
- **Backend**: Node.js + Express + TypeScript
- **Database**: SQLite via Prisma ORM
- **Container**: Single Docker container
