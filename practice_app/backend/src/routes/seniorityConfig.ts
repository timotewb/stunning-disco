import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

const DEFAULT_SENIORITIES = [
  { name: 'Junior',    color: 'blue'   },
  { name: 'Mid',       color: 'green'  },
  { name: 'Senior',    color: 'indigo' },
  { name: 'Lead',      color: 'purple' },
  { name: 'Principal', color: 'orange' },
  { name: 'Director',  color: 'rose'   },
];

async function seedDefaults() {
  const count = await prisma.seniorityConfig.count();
  if (count === 0) {
    await prisma.seniorityConfig.createMany({ data: DEFAULT_SENIORITIES });
  }
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    await seedDefaults();
    const items = await prisma.seniorityConfig.findMany({ orderBy: { createdAt: 'asc' } });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, color = 'gray' } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const item = await prisma.seniorityConfig.create({
      data: { name: name.trim(), color },
    });
    res.status(201).json(item);
  } catch (err: any) {
    if (err?.code === 'P2002') return res.status(409).json({ error: 'Seniority name already exists' });
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const item = await prisma.seniorityConfig.findUnique({ where: { id } });
    if (!item) return res.status(404).json({ error: 'Not found' });
    await prisma.seniorityConfig.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
