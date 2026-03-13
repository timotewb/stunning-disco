/**
 * Configurable taxonomy routes for Work Request fields.
 * Each taxonomy supports GET (list), POST (create), PUT/:id (update), DELETE/:id.
 *
 * Mounted at:
 *   /api/request-source-config
 *   /api/request-type-config
 *   /api/request-priority-config
 *   /api/request-status-config
 *   /api/request-effort-config
 */
import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type TaxonomyModel =
  | 'requestSourceConfig'
  | 'requestTypeConfig'
  | 'requestPriorityConfig'
  | 'requestStatusConfig'
  | 'requestEffortConfig';

function makeRouter(model: TaxonomyModel, hasValue = false) {
  const router = Router();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = (prisma as any)[model];

  router.get('/', async (_req: Request, res: Response) => {
    const rows = await table.findMany({ orderBy: { orderIndex: 'asc' } });
    res.json(rows);
  });

  router.post('/', async (req: Request, res: Response) => {
    const { name, color = 'gray', orderIndex = 0, value } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    if (hasValue && !value?.trim()) return res.status(400).json({ error: 'value is required' });
    const data: Record<string, unknown> = { name: name.trim(), color, orderIndex };
    if (hasValue) data.value = value.trim();
    const row = await table.create({ data });
    res.status(201).json(row);
  });

  router.put('/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const { name, color, orderIndex, value } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (color !== undefined) data.color = color;
    if (orderIndex !== undefined) data.orderIndex = orderIndex;
    if (hasValue && value !== undefined) data.value = value;
    const row = await table.update({ where: { id }, data });
    res.json(row);
  });

  router.delete('/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    await table.delete({ where: { id } });
    res.status(204).send();
  });

  return router;
}

export const requestSourceConfigRouter  = makeRouter('requestSourceConfig');
export const requestTypeConfigRouter    = makeRouter('requestTypeConfig');
export const requestPriorityConfigRouter = makeRouter('requestPriorityConfig');
export const requestStatusConfigRouter  = makeRouter('requestStatusConfig');
export const requestEffortConfigRouter  = makeRouter('requestEffortConfig', true);
