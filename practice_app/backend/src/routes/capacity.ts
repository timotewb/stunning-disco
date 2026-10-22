/**
 * Capacity and demand.
 *
 *   GET    /api/capacity                  aggregated capacity vs demand over time
 *   GET    /api/capacity/config           hours-per-FTE display setting
 *   PUT    /api/capacity/config
 *   GET    /api/capacity/undated-leavers  members who left but have no endDate
 *   GET    /api/capacity/changes/:memberId
 *   POST   /api/capacity/changes
 *   PUT    /api/capacity/changes/:id
 *   DELETE /api/capacity/changes/:id
 *
 * The computation itself lives in ../lib/capacity so the rules stay testable
 * independently of HTTP.
 */
import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import {
  computeCapacity,
  dateKey,
  parseDateKey,
  type Bucket,
  type GroupBy,
  type MemberInput,
} from '../lib/capacity';
import { CONFIDENCE_LEVELS } from './initiatives';

const router = Router();
const prisma = new PrismaClient();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── Display config ───────────────────────────────────────────────────────────
// Stored as JSON next to the database, matching the existing ai-config.json
// pattern in routes/ai.ts. Capacity is always stored and computed in FTE; this
// only drives an optional "show as hours" toggle in the UI.

const DEFAULT_HOURS_PER_FTE = 37.5;

function configPath(): string {
  const url = process.env.DATABASE_URL ?? 'file:./prisma/dev.db';
  const absDb = path.resolve(url.replace(/^file:/, ''));
  return path.join(path.dirname(absDb), 'capacity-config.json');
}

function readConfig(): { hoursPerFte: number } {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const parsed = JSON.parse(raw);
    const hours = Number(parsed?.hoursPerFte);
    if (Number.isFinite(hours) && hours > 0) return { hoursPerFte: hours };
  } catch {
    // Missing or unreadable config is expected on first run.
  }
  return { hoursPerFte: DEFAULT_HOURS_PER_FTE };
}

router.get('/config', (_req: Request, res: Response) => {
  res.json(readConfig());
});

router.put('/config', (req: Request, res: Response) => {
  try {
    const hours = Number(req.body?.hoursPerFte);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 168) {
      return res.status(400).json({ error: 'hoursPerFte must be between 0 and 168' });
    }
    const config = { hoursPerFte: hours };
    fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Undated leavers ──────────────────────────────────────────────────────────

/**
 * Members flagged as leaving or departed who have no `endDate`.
 *
 * Their historical capacity can't be reconstructed without a date, so they are
 * counted as present until one is supplied. That overstates capacity — the
 * banner this feeds exists so the error is visible and fixable rather than silent.
 */
router.get('/undated-leavers', async (_req: Request, res: Response) => {
  try {
    const members = await prisma.teamMember.findMany({
      where: { endDate: null, OR: [{ hasLeft: true }, { isLeaving: true }] },
      select: { id: true, name: true, role: true, hasLeft: true, isLeaving: true },
      orderBy: { name: 'asc' },
    });
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── CapacityChange CRUD ──────────────────────────────────────────────────────

function validateChange(body: any): { error: string } | { effectiveFrom: Date; effectiveTo: Date | null; fte: number } {
  const { effectiveFrom, effectiveTo, fte } = body ?? {};
  if (!DATE_RE.test(String(effectiveFrom ?? ''))) {
    return { error: 'effectiveFrom must be YYYY-MM-DD' };
  }
  if (effectiveTo != null && effectiveTo !== '' && !DATE_RE.test(String(effectiveTo))) {
    return { error: 'effectiveTo must be YYYY-MM-DD or null' };
  }
  const value = Number(fte);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    return { error: 'fte must be between 0 and 1' };
  }
  const from = parseDateKey(String(effectiveFrom));
  const to = effectiveTo ? parseDateKey(String(effectiveTo)) : null;
  if (to && to < from) {
    return { error: 'effectiveTo cannot be before effectiveFrom' };
  }
  return { effectiveFrom: from, effectiveTo: to, fte: value };
}

router.get('/changes/:memberId', async (req: Request, res: Response) => {
  try {
    const changes = await prisma.capacityChange.findMany({
      where: { teamMemberId: String(req.params.memberId) },
      orderBy: { effectiveFrom: 'asc' },
    });
    res.json(changes);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/changes', async (req: Request, res: Response) => {
  try {
    const { teamMemberId, reason, notes } = req.body ?? {};
    if (!teamMemberId) return res.status(400).json({ error: 'teamMemberId is required' });

    const parsed = validateChange(req.body);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });

    const change = await prisma.capacityChange.create({
      data: {
        teamMemberId: String(teamMemberId),
        ...parsed,
        reason: reason ? String(reason) : null,
        notes: notes ? String(notes) : null,
      },
    });
    res.status(201).json(change);
  } catch (err: any) {
    // Two rows sharing an effectiveFrom for one member would make resolution
    // ambiguous — the schema rejects it and so do we, with a clear message.
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'This member already has a change starting on that date' });
    }
    if (err?.code === 'P2003') return res.status(404).json({ error: 'Team member not found' });
    res.status(500).json({ error: String(err) });
  }
});

router.put('/changes/:id', async (req: Request, res: Response) => {
  try {
    const parsed = validateChange(req.body);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });

    const { reason, notes } = req.body ?? {};
    const change = await prisma.capacityChange.update({
      where: { id: String(req.params.id) },
      data: {
        ...parsed,
        reason: reason ? String(reason) : null,
        notes: notes ? String(notes) : null,
      },
    });
    res.json(change);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'This member already has a change starting on that date' });
    }
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Change not found' });
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/changes/:id', async (req: Request, res: Response) => {
  try {
    await prisma.capacityChange.delete({ where: { id: String(req.params.id) } });
    res.status(204).end();
  } catch (err: any) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Change not found' });
    res.status(500).json({ error: String(err) });
  }
});

// ── Aggregated capacity vs demand ────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    if (!DATE_RE.test(String(from ?? '')) || !DATE_RE.test(String(to ?? ''))) {
      return res.status(400).json({ error: 'from and to are required, as YYYY-MM-DD' });
    }
    const fromDate = parseDateKey(String(from));
    const toDate = parseDateKey(String(to));
    if (toDate < fromDate) {
      return res.status(400).json({ error: 'to cannot be before from' });
    }
    // A decade of weekly buckets is already far past useful; the cap exists to
    // stop a malformed range turning into a multi-million-day loop.
    const spanDays = (toDate.getTime() - fromDate.getTime()) / 86_400_000;
    if (spanDays > 3660) {
      return res.status(400).json({ error: 'Range cannot exceed 10 years' });
    }

    const bucket: Bucket = req.query.bucket === 'month' ? 'month' : 'week';
    const rawGroup = String(req.query.groupBy ?? 'none');
    const groupBy: GroupBy = (['none', 'role', 'seniority', 'tag'] as const).includes(rawGroup as GroupBy)
      ? (rawGroup as GroupBy)
      : 'none';

    // Confidence filter. Absent means "everything"; an explicit empty value
    // means the user deselected every level, which must show no planned demand
    // rather than silently reverting to all of it.
    const rawConfidence = req.query.confidence;
    const confidences =
      rawConfidence === undefined
        ? null
        : String(rawConfidence)
            .split(',')
            .map((c) => c.trim())
            .filter((c) => CONFIDENCE_LEVELS.includes(c as any));
    const roleFilter = String(req.query.role ?? '').trim().toLowerCase();

    const [members, allocations, types, holidays, demands] = await Promise.all([
      prisma.teamMember.findMany({
        include: { capacityChanges: true },
        orderBy: { name: 'asc' },
      }),
      prisma.workRequest.findMany({
        where: {
          isAllocated: true,
          isDraft: false,
          allocationStartDate: { lte: toDate },
          allocationEndDate: { gte: fromDate },
        },
      }),
      prisma.allocationTypeConfig.findMany(),
      prisma.holiday.findMany({ where: { date: { gte: fromDate, lte: toDate } } }),
      prisma.roleDemand.findMany({
        where: {
          startDate: { lte: toDate },
          endDate: { gte: fromDate },
          ...(confidences ? { project: { initiative: { confidence: { in: confidences } } } } : {}),
        },
        include: { project: { include: { initiative: true } } },
      }),
    ]);

    const memberInputs: MemberInput[] = members.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      seniority: m.seniority,
      // tags is a JSON string in SQLite — see the project conventions.
      tags: safeTags(m.tags),
      baselineFte: m.baselineFte,
      startDate: m.startDate,
      endDate: m.endDate,
      capacityChanges: m.capacityChanges.map((c) => ({
        effectiveFrom: c.effectiveFrom,
        effectiveTo: c.effectiveTo,
        fte: c.fte,
        reason: c.reason,
      })),
    }));

    const result = computeCapacity({
      members: memberInputs,
      allocations: allocations.map((a) => ({
        id: a.id,
        title: a.title,
        assigneeId: a.assigneeId,
        allocationType: a.allocationType,
        allocationStartDate: a.allocationStartDate,
        allocationEndDate: a.allocationEndDate,
        allocationFte: a.allocationFte,
      })),
      leaveTypes: new Set(types.filter((t) => t.reducesCapacity).map((t) => t.name)),
      holidays: new Set(holidays.map((h) => dateKey(h.date))),
      roleDemands: demands
        .filter((d) => !roleFilter || d.role.trim().toLowerCase() === roleFilter)
        .map((d) => ({
          id: d.id,
          role: d.role,
          seniority: d.seniority,
          fte: d.fte,
          startDate: d.startDate,
          endDate: d.endDate,
          fulfilledByRequestId: d.fulfilledByRequestId,
          projectName: d.project.name,
          initiativeId: d.project.initiativeId,
          initiativeName: d.project.initiative.name,
          confidence: d.project.initiative.confidence,
          color: d.project.initiative.color,
        })),
      from: fromDate,
      to: toDate,
      bucket,
      groupBy,
    });

    res.json({ ...result, hoursPerFte: readConfig().hoursPerFte });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

function safeTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export default router;
