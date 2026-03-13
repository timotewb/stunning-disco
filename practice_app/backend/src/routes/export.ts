import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.get('/matrix', async (_req: Request, res: Response) => {
  try {
    const entries = await prisma.matrixEntry.findMany({
      include: { teamMember: true, dimensionNode: true, snapshot: true },
    });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/timeline', async (_req: Request, res: Response) => {
  try {
    // Allocation model has been removed; return empty array for backward compatibility
    res.json([]);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/capabilities', async (_req: Request, res: Response) => {
  try {
    const [dimensions, entries, smeAssignments] = await Promise.all([
      prisma.dimension.findMany({ include: { nodes: true } }),
      prisma.matrixEntry.findMany({ include: { dimensionNode: true } }),
      prisma.sMEAssignment.findMany({
        include: { dimensionNode: true, primaryMember: true, backupMember: true },
      }),
    ]);
    res.json({ dimensions, entries, smeAssignments });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
