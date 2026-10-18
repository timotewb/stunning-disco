import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parses a YYYY-MM-DD tenure date to UTC midnight; '' and null clear it. */
function parseTenureDate(value: unknown): Date | null | undefined {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !DATE_RE.test(value)) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Clamps baseline FTE to 0–1; anything unparseable is ignored by the caller. */
function parseFte(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) return undefined;
  return n;
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    const members = await prisma.teamMember.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(members.map((m) => ({ ...m, tags: JSON.parse(m.tags) })));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      name, role, seniority, tags = [], notes = '',
      isLeaving = false, hasLeft = false,
      baselineFte, startDate, endDate,
    } = req.body;

    const fte = parseFte(baselineFte);
    const start = parseTenureDate(startDate);
    const end = parseTenureDate(endDate);
    if (start && end && end < start) {
      return res.status(400).json({ error: 'endDate cannot be before startDate' });
    }

    const member = await prisma.teamMember.create({
      data: {
        name, role, seniority, tags: JSON.stringify(tags), notes, isLeaving, hasLeft,
        ...(fte !== undefined && { baselineFte: fte }),
        ...(start !== undefined && { startDate: start }),
        ...(end !== undefined && { endDate: end }),
      },
    });
    res.status(201).json({ ...member, tags: JSON.parse(member.tags) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const {
      name, role, seniority, tags, notes, isLeaving, hasLeft,
      baselineFte, startDate, endDate,
    } = req.body;

    const fte = baselineFte === undefined ? undefined : parseFte(baselineFte);
    if (baselineFte !== undefined && fte === undefined) {
      return res.status(400).json({ error: 'baselineFte must be between 0 and 1' });
    }
    const start = startDate === undefined ? undefined : parseTenureDate(startDate);
    if (startDate !== undefined && start === undefined) {
      return res.status(400).json({ error: 'startDate must be YYYY-MM-DD or null' });
    }
    const end = endDate === undefined ? undefined : parseTenureDate(endDate);
    if (endDate !== undefined && end === undefined) {
      return res.status(400).json({ error: 'endDate must be YYYY-MM-DD or null' });
    }

    // Only one bound may be supplied on a PUT, so compare against stored values.
    const existing = await prisma.teamMember.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Team member not found' });
    const finalStart = start !== undefined ? start : existing.startDate;
    const finalEnd = end !== undefined ? end : existing.endDate;
    if (finalStart && finalEnd && finalEnd < finalStart) {
      return res.status(400).json({ error: 'endDate cannot be before startDate' });
    }

    const member = await prisma.teamMember.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(role !== undefined && { role }),
        ...(seniority !== undefined && { seniority }),
        ...(tags !== undefined && { tags: JSON.stringify(tags) }),
        ...(notes !== undefined && { notes }),
        ...(isLeaving !== undefined && { isLeaving }),
        ...(hasLeft !== undefined && { hasLeft }),
        ...(fte !== undefined && { baselineFte: fte }),
        ...(start !== undefined && { startDate: start }),
        ...(end !== undefined && { endDate: end }),
      },
    });
    res.json({ ...member, tags: JSON.parse(member.tags) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.teamMember.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
