import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const dimensions = await prisma.dimension.findMany({
      include: { nodes: { orderBy: { orderIndex: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    res.json(dimensions);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, type = 'skills', description = '' } = req.body;
    const dimension = await prisma.dimension.create({
      data: { name, type, description },
      include: { nodes: true },
    });
    res.status(201).json(dimension);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { name, type, description } = req.body;
    const dimension = await prisma.dimension.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(description !== undefined && { description }),
      },
      include: { nodes: { orderBy: { orderIndex: 'asc' } } },
    });
    res.json(dimension);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.dimension.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/:id/nodes', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const nodes = await prisma.dimensionNode.findMany({
      where: { dimensionId: id },
      orderBy: { orderIndex: 'asc' },
    });
    res.json(nodes);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
