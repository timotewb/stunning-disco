import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const snapshots = await prisma.snapshot.findMany({
      orderBy: { timestamp: 'asc' },
    });
    res.json(snapshots);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { timestamp, label } = req.body;
    const snapshot = await prisma.snapshot.create({
      data: {
        timestamp: new Date(timestamp || Date.now()),
        label: label || new Date().toISOString().split('T')[0],
      },
    });
    res.status(201).json(snapshot);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.snapshot.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
