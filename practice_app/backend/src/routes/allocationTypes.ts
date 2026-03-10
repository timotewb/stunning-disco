import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

const DEFAULT_TYPES = [
  { name: 'project', color: 'indigo' },
  { name: 'leave', color: 'amber' },
  { name: 'internal', color: 'green' },
  { name: 'training', color: 'blue' },
];

async function seedDefaults() {
  const count = await prisma.allocationTypeConfig.count();
  if (count === 0) {
    await prisma.allocationTypeConfig.createMany({ data: DEFAULT_TYPES });
  }
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    await seedDefaults();
    const types = await prisma.allocationTypeConfig.findMany({ orderBy: { createdAt: 'asc' } });
    res.json(types);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, color = 'gray' } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const type = await prisma.allocationTypeConfig.create({
      data: { name: name.trim().toLowerCase(), color },
    });
    res.status(201).json(type);
  } catch (err: any) {
    if (err?.code === 'P2002') return res.status(409).json({ error: 'Type name already exists' });
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const type = await prisma.allocationTypeConfig.findUnique({ where: { id } });
    if (!type) return res.status(404).json({ error: 'Not found' });

    await prisma.allocationTypeConfig.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
