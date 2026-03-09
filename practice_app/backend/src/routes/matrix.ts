import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/matrix?dimensionId=&snapshotId=
router.get('/', async (req: Request, res: Response) => {
  try {
    const { dimensionId, snapshotId } = req.query;
    const entries = await prisma.matrixEntry.findMany({
      where: {
        ...(snapshotId && { snapshotId: String(snapshotId) }),
        ...(dimensionId && {
          dimensionNode: { dimensionId: String(dimensionId) },
        }),
      },
      include: {
        teamMember: true,
        dimensionNode: true,
        snapshot: true,
      },
    });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/matrix-entry — upsert (also accessible via /api/matrix/entry)
router.post('/entry', async (req: Request, res: Response) => {
  try {
    const { teamMemberId, dimensionNodeId, snapshotId, value } = req.body;
    const entry = await prisma.matrixEntry.upsert({
      where: {
        teamMemberId_dimensionNodeId_snapshotId: {
          teamMemberId,
          dimensionNodeId,
          snapshotId,
        },
      },
      update: { value },
      create: { teamMemberId, dimensionNodeId, snapshotId, value },
    });
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/matrix-entry/:id (also accessible via /api/matrix/entry/:id)
router.delete('/entry/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.matrixEntry.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST / — upsert (when mounted at /api/matrix-entry)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { teamMemberId, dimensionNodeId, snapshotId, value } = req.body;
    const entry = await prisma.matrixEntry.upsert({
      where: {
        teamMemberId_dimensionNodeId_snapshotId: {
          teamMemberId,
          dimensionNodeId,
          snapshotId,
        },
      },
      update: { value },
      create: { teamMemberId, dimensionNodeId, snapshotId, value },
    });
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /:id (when mounted at /api/matrix-entry)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.matrixEntry.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
