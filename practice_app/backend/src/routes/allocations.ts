import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const allocations = await prisma.allocation.findMany({
      include: { teamMember: true },
      orderBy: { startDate: 'asc' },
    });
    res.json(allocations);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { teamMemberId, projectName, type = 'project', startDate, endDate, notes = '' } = req.body;
    const allocation = await prisma.allocation.create({
      data: {
        teamMemberId,
        projectName,
        type,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        notes,
      },
      include: { teamMember: true },
    });
    res.status(201).json(allocation);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { teamMemberId, projectName, type, startDate, endDate, notes } = req.body;
    const allocation = await prisma.allocation.update({
      where: { id },
      data: {
        ...(teamMemberId !== undefined && { teamMemberId }),
        ...(projectName !== undefined && { projectName }),
        ...(type !== undefined && { type }),
        ...(startDate !== undefined && { startDate: new Date(startDate) }),
        ...(endDate !== undefined && { endDate: new Date(endDate) }),
        ...(notes !== undefined && { notes }),
      },
      include: { teamMember: true },
    });
    res.json(allocation);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.allocation.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
