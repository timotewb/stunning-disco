import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

// GET /api/contacts?q=
router.get('/', async (req, res) => {
  const q = req.query.q as string | undefined;
  const contacts = await prisma.contact.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q } },
            { role: { contains: q } },
            { team: { contains: q } },
            { email: { contains: q } },
          ],
        }
      : undefined,
    orderBy: { name: 'asc' },
  });
  res.json(contacts);
});

// POST /api/contacts
router.post('/', async (req, res) => {
  const { name, role, team, email, notes } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const contact = await prisma.contact.create({
    data: { name: name.trim(), role, team, email, notes },
  });
  res.status(201).json(contact);
});

// PUT /api/contacts/:id
router.put('/:id', async (req, res) => {
  const id = String(req.params.id);
  const { name, role, team, email, notes } = req.body;
  const contact = await prisma.contact.update({
    where: { id },
    data: { name, role, team, email, notes },
  });
  res.json(contact);
});

// DELETE /api/contacts/:id — sets requestorId to null on linked requests (onDelete: SetNull)
router.delete('/:id', async (req, res) => {
  const id = String(req.params.id);
  await prisma.contact.delete({ where: { id } });
  res.status(204).send();
});

export default router;
