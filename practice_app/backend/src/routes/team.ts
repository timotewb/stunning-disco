import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

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
    const { name, role, seniority, tags = [], notes = '' } = req.body;
    const member = await prisma.teamMember.create({
      data: { name, role, seniority, tags: JSON.stringify(tags), notes },
    });
    res.status(201).json({ ...member, tags: JSON.parse(member.tags) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { name, role, seniority, tags, notes } = req.body;
    const member = await prisma.teamMember.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(role !== undefined && { role }),
        ...(seniority !== undefined && { seniority }),
        ...(tags !== undefined && { tags: JSON.stringify(tags) }),
        ...(notes !== undefined && { notes }),
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
