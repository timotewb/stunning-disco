/**
 * Initiatives, projects and role demand — the forward-looking pipeline.
 *
 *   GET    /api/initiatives                full tree: initiatives > projects > demands
 *   POST   /api/initiatives
 *   PUT    /api/initiatives/:id
 *   DELETE /api/initiatives/:id
 *
 *   POST   /api/initiatives/projects
 *   PUT    /api/initiatives/projects/:id
 *   DELETE /api/initiatives/projects/:id
 *
 *   POST   /api/initiatives/demands
 *   PUT    /api/initiatives/demands/:id
 *   DELETE /api/initiatives/demands/:id
 *
 *   GET    /api/initiatives/roles          distinct roles, for autocomplete
 *
 * Projects and demands are nested under this router rather than given their own
 * top-level paths because they are meaningless outside an initiative, and
 * deleting the parent cascades to both.
 */
import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { parseDateKey } from '../lib/capacity';

const router = Router();
const prisma = new PrismaClient();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/// Filters what the planning view shows. Deliberately does not weight the FTE —
/// see demand-planning-design.md §3.1.
export const CONFIDENCE_LEVELS = ['candidate', 'probable', 'committed'] as const;
type Confidence = (typeof CONFIDENCE_LEVELS)[number];

function parseOptionalDate(value: unknown): { error: string } | { date: Date | null } {
  if (value == null || value === '') return { date: null };
  if (!DATE_RE.test(String(value))) return { error: 'Dates must be YYYY-MM-DD' };
  return { date: parseDateKey(String(value)) };
}

// ── Initiatives ──────────────────────────────────────────────────────────────

router.get('/', async (_req: Request, res: Response) => {
  try {
    const initiatives = await prisma.initiative.findMany({
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
      include: {
        projects: {
          orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
          include: { roleDemands: { orderBy: { startDate: 'asc' } } },
        },
      },
    });
    res.json(initiatives);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description, confidence, color, orderIndex } = req.body ?? {};
    if (!String(name ?? '').trim()) return res.status(400).json({ error: 'name is required' });
    if (confidence != null && !CONFIDENCE_LEVELS.includes(confidence)) {
      return res.status(400).json({ error: `confidence must be one of ${CONFIDENCE_LEVELS.join(', ')}` });
    }
    const initiative = await prisma.initiative.create({
      data: {
        name: String(name).trim(),
        description: description ? String(description) : '',
        confidence: (confidence as Confidence) ?? 'committed',
        color: color ? String(color) : 'indigo',
        orderIndex: Number.isFinite(Number(orderIndex)) ? Number(orderIndex) : 0,
      },
      include: { projects: { include: { roleDemands: true } } },
    });
    res.status(201).json(initiative);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, description, confidence, color, orderIndex } = req.body ?? {};
    if (name != null && !String(name).trim()) {
      return res.status(400).json({ error: 'name cannot be empty' });
    }
    if (confidence != null && !CONFIDENCE_LEVELS.includes(confidence)) {
      return res.status(400).json({ error: `confidence must be one of ${CONFIDENCE_LEVELS.join(', ')}` });
    }
    const initiative = await prisma.initiative.update({
      where: { id: String(req.params.id) },
      data: {
        ...(name != null ? { name: String(name).trim() } : {}),
        ...(description != null ? { description: String(description) } : {}),
        ...(confidence != null ? { confidence: String(confidence) } : {}),
        ...(color != null ? { color: String(color) } : {}),
        ...(orderIndex != null && Number.isFinite(Number(orderIndex))
          ? { orderIndex: Number(orderIndex) }
          : {}),
      },
      include: {
        projects: {
          orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
          include: { roleDemands: { orderBy: { startDate: 'asc' } } },
        },
      },
    });
    res.json(initiative);
  } catch (err: any) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Initiative not found' });
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.initiative.delete({ where: { id: String(req.params.id) } });
    res.status(204).end();
  } catch (err: any) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Initiative not found' });
    res.status(500).json({ error: String(err) });
  }
});

// ── Projects ─────────────────────────────────────────────────────────────────

router.post('/projects', async (req: Request, res: Response) => {
  try {
    const { initiativeId, name, notes, startDate, endDate, orderIndex } = req.body ?? {};
    if (!initiativeId) return res.status(400).json({ error: 'initiativeId is required' });
    if (!String(name ?? '').trim()) return res.status(400).json({ error: 'name is required' });

    const start = parseOptionalDate(startDate);
    if ('error' in start) return res.status(400).json({ error: start.error });
    const end = parseOptionalDate(endDate);
    if ('error' in end) return res.status(400).json({ error: end.error });
    if (start.date && end.date && end.date < start.date) {
      return res.status(400).json({ error: 'endDate cannot be before startDate' });
    }

    const project = await prisma.project.create({
      data: {
        initiativeId: String(initiativeId),
        name: String(name).trim(),
        notes: notes ? String(notes) : '',
        startDate: start.date,
        endDate: end.date,
        orderIndex: Number.isFinite(Number(orderIndex)) ? Number(orderIndex) : 0,
      },
      include: { roleDemands: true },
    });
    res.status(201).json(project);
  } catch (err: any) {
    if (err?.code === 'P2003') return res.status(404).json({ error: 'Initiative not found' });
    res.status(500).json({ error: String(err) });
  }
});

router.put('/projects/:id', async (req: Request, res: Response) => {
  try {
    const { name, notes, startDate, endDate, orderIndex } = req.body ?? {};
    if (name != null && !String(name).trim()) {
      return res.status(400).json({ error: 'name cannot be empty' });
    }
    const start = parseOptionalDate(startDate);
    if ('error' in start) return res.status(400).json({ error: start.error });
    const end = parseOptionalDate(endDate);
    if ('error' in end) return res.status(400).json({ error: end.error });

    // Re-read so a single-bound update still validates against the stored
    // other bound, rather than only against what happened to be sent.
    const existing = await prisma.project.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) return res.status(404).json({ error: 'Project not found' });

    const nextStart = startDate !== undefined ? start.date : existing.startDate;
    const nextEnd = endDate !== undefined ? end.date : existing.endDate;
    if (nextStart && nextEnd && nextEnd < nextStart) {
      return res.status(400).json({ error: 'endDate cannot be before startDate' });
    }

    const project = await prisma.project.update({
      where: { id: String(req.params.id) },
      data: {
        ...(name != null ? { name: String(name).trim() } : {}),
        ...(notes != null ? { notes: String(notes) } : {}),
        ...(startDate !== undefined ? { startDate: start.date } : {}),
        ...(endDate !== undefined ? { endDate: end.date } : {}),
        ...(orderIndex != null && Number.isFinite(Number(orderIndex))
          ? { orderIndex: Number(orderIndex) }
          : {}),
      },
      include: { roleDemands: { orderBy: { startDate: 'asc' } } },
    });
    res.json(project);
  } catch (err: any) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Project not found' });
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/projects/:id', async (req: Request, res: Response) => {
  try {
    await prisma.project.delete({ where: { id: String(req.params.id) } });
    res.status(204).end();
  } catch (err: any) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Project not found' });
    res.status(500).json({ error: String(err) });
  }
});

// ── Role demands ─────────────────────────────────────────────────────────────

/**
 * A demand linked to a request that is not actually allocated would vanish from
 * the chart with no error: the engine skips linked demands, but an unallocated
 * request contributes no demand of its own, so the ask would silently
 * disappear. Reject the link instead.
 */
async function validateFulfilment(
  requestId: unknown
): Promise<{ error: string } | { fulfilledByRequestId: string | null }> {
  if (requestId == null || requestId === '') return { fulfilledByRequestId: null };
  const request = await prisma.workRequest.findUnique({
    where: { id: String(requestId) },
    select: { id: true, isAllocated: true, assigneeId: true },
  });
  if (!request) return { error: 'Linked work request not found' };
  if (!request.isAllocated || !request.assigneeId) {
    return {
      error:
        'That work request is not allocated to anyone yet, so linking it would remove this demand from the forecast without replacing it',
    };
  }
  return { fulfilledByRequestId: request.id };
}

function validateDemandDates(
  startDate: unknown,
  endDate: unknown
): { error: string } | { startDate: Date; endDate: Date } {
  if (!DATE_RE.test(String(startDate ?? ''))) {
    return { error: 'startDate must be YYYY-MM-DD' };
  }
  if (!DATE_RE.test(String(endDate ?? ''))) {
    return { error: 'endDate must be YYYY-MM-DD' };
  }
  const start = parseDateKey(String(startDate));
  const end = parseDateKey(String(endDate));
  if (end < start) return { error: 'endDate cannot be before startDate' };
  return { startDate: start, endDate: end };
}

function parseFte(value: unknown): { error: string } | { fte: number } {
  const fte = Number(value);
  // No upper bound: "we need six engineers" is a legitimate ask, and capping it
  // would quietly understate the gap this view exists to show.
  if (!Number.isFinite(fte) || fte <= 0) return { error: 'fte must be greater than 0' };
  return { fte };
}

router.post('/demands', async (req: Request, res: Response) => {
  try {
    const { projectId, role, seniority, fte, startDate, endDate, notes, fulfilledByRequestId } =
      req.body ?? {};
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });
    if (!String(role ?? '').trim()) return res.status(400).json({ error: 'role is required' });

    const dates = validateDemandDates(startDate, endDate);
    if ('error' in dates) return res.status(400).json({ error: dates.error });
    const parsedFte = parseFte(fte);
    if ('error' in parsedFte) return res.status(400).json({ error: parsedFte.error });
    const fulfilment = await validateFulfilment(fulfilledByRequestId);
    if ('error' in fulfilment) return res.status(400).json({ error: fulfilment.error });

    const demand = await prisma.roleDemand.create({
      data: {
        projectId: String(projectId),
        role: String(role).trim(),
        seniority: seniority ? String(seniority) : null,
        notes: notes ? String(notes) : null,
        ...dates,
        ...parsedFte,
        ...fulfilment,
      },
    });
    res.status(201).json(demand);
  } catch (err: any) {
    if (err?.code === 'P2003') return res.status(404).json({ error: 'Project not found' });
    res.status(500).json({ error: String(err) });
  }
});

router.put('/demands/:id', async (req: Request, res: Response) => {
  try {
    const { role, seniority, fte, startDate, endDate, notes, fulfilledByRequestId } = req.body ?? {};
    if (role != null && !String(role).trim()) {
      return res.status(400).json({ error: 'role cannot be empty' });
    }
    const dates = validateDemandDates(startDate, endDate);
    if ('error' in dates) return res.status(400).json({ error: dates.error });
    const parsedFte = parseFte(fte);
    if ('error' in parsedFte) return res.status(400).json({ error: parsedFte.error });
    const fulfilment = await validateFulfilment(fulfilledByRequestId);
    if ('error' in fulfilment) return res.status(400).json({ error: fulfilment.error });

    const demand = await prisma.roleDemand.update({
      where: { id: String(req.params.id) },
      data: {
        ...(role != null ? { role: String(role).trim() } : {}),
        seniority: seniority ? String(seniority) : null,
        notes: notes ? String(notes) : null,
        ...dates,
        ...parsedFte,
        ...fulfilment,
      },
    });
    res.json(demand);
  } catch (err: any) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Demand not found' });
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/demands/:id', async (req: Request, res: Response) => {
  try {
    await prisma.roleDemand.delete({ where: { id: String(req.params.id) } });
    res.status(204).end();
  } catch (err: any) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Demand not found' });
    res.status(500).json({ error: String(err) });
  }
});

// ── Role autocomplete ────────────────────────────────────────────────────────

/**
 * Roles already in use, from both the team and existing demands. Only a
 * suggestion list: demand for a role nobody holds is the point of the feature,
 * so the field stays free text.
 */
router.get('/roles', async (_req: Request, res: Response) => {
  try {
    const [members, demands] = await Promise.all([
      prisma.teamMember.findMany({ where: { hasLeft: false }, select: { role: true } }),
      prisma.roleDemand.findMany({ select: { role: true } }),
    ]);
    const roles = new Set<string>();
    for (const r of [...members, ...demands]) {
      const name = r.role?.trim();
      if (name) roles.add(name);
    }
    res.json([...roles].sort((a, b) => a.localeCompare(b)));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
