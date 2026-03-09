import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const smeAssignments = await prisma.sMEAssignment.findMany({
      include: {
        dimensionNode: true,
        primaryMember: true,
        backupMember: true,
        snapshot: true,
      },
    });
    res.json(smeAssignments);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/sme — upsert by dimensionNodeId+snapshotId
router.post('/', async (req: Request, res: Response) => {
  try {
    const { dimensionNodeId, primaryMemberId, backupMemberId = null, snapshotId } = req.body;
    const assignment = await prisma.sMEAssignment.upsert({
      where: {
        dimensionNodeId_snapshotId: { dimensionNodeId, snapshotId },
      },
      update: { primaryMemberId, backupMemberId },
      create: { dimensionNodeId, primaryMemberId, backupMemberId, snapshotId },
      include: {
        dimensionNode: true,
        primaryMember: true,
        backupMember: true,
        snapshot: true,
      },
    });
    res.json(assignment);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.sMEAssignment.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
