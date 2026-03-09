import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { dimensionId } = req.query;
    const nodes = await prisma.dimensionNode.findMany({
      where: dimensionId ? { dimensionId: String(dimensionId) } : undefined,
      orderBy: { orderIndex: 'asc' },
    });
    res.json(nodes);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { dimensionId, parentId = null, name, orderIndex = 0 } = req.body;
    const node = await prisma.dimensionNode.create({
      data: { dimensionId, parentId, name, orderIndex },
    });
    res.status(201).json(node);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { name, parentId, orderIndex } = req.body;
    const node = await prisma.dimensionNode.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(parentId !== undefined && { parentId }),
        ...(orderIndex !== undefined && { orderIndex }),
      },
    });
    res.json(node);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.dimensionNode.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
