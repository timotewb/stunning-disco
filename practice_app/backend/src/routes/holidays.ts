/**
 * Public holidays.
 *
 *   /api/holidays
 *
 * Holidays are treated by the capacity engine as working days with ZERO
 * capacity — not as excluded days like weekends. See capacity-planning-design.md
 * §3.5: excluding them would make a four-working-day week average back out to
 * full capacity and the dip would vanish, which is the opposite of what's wanted.
 */
import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

/**
 * NZ national public holidays, 2025–2027.
 *
 * Source: employment.govt.nz public holidays and anniversary dates (verified,
 * not computed). Only the OBSERVED weekday is seeded — where a holiday is
 * Mondayised the Monday is used, because weekends are excluded from the
 * working-day set and a Saturday row would have no effect.
 *
 * Regional anniversary days are deliberately NOT seeded: they vary by province
 * and the list is user-editable, so the relevant one is added in Settings.
 */
const NZ_HOLIDAYS: { name: string; date: string }[] = [
  // 2025
  { name: "New Year's Day",           date: '2025-01-01' },
  { name: "Day after New Year's Day", date: '2025-01-02' },
  { name: 'Waitangi Day',             date: '2025-02-06' },
  { name: 'Good Friday',              date: '2025-04-18' },
  { name: 'Easter Monday',            date: '2025-04-21' },
  { name: 'Anzac Day',                date: '2025-04-25' },
  { name: "King's Birthday",          date: '2025-06-02' },
  { name: 'Matariki',                 date: '2025-06-20' },
  { name: 'Labour Day',               date: '2025-10-27' },
  { name: 'Christmas Day',            date: '2025-12-25' },
  { name: 'Boxing Day',               date: '2025-12-26' },
  // 2026
  { name: "New Year's Day",           date: '2026-01-01' },
  { name: "Day after New Year's Day", date: '2026-01-02' },
  { name: 'Waitangi Day',             date: '2026-02-06' },
  { name: 'Good Friday',              date: '2026-04-03' },
  { name: 'Easter Monday',            date: '2026-04-06' },
  { name: 'Anzac Day (observed)',     date: '2026-04-27' }, // actual 25 Apr falls Saturday
  { name: "King's Birthday",          date: '2026-06-01' },
  { name: 'Matariki',                 date: '2026-07-10' },
  { name: 'Labour Day',               date: '2026-10-26' },
  { name: 'Christmas Day',            date: '2026-12-25' },
  { name: 'Boxing Day (observed)',    date: '2026-12-28' }, // actual 26 Dec falls Saturday
  // 2027
  { name: "New Year's Day",           date: '2027-01-01' },
  { name: "Day after New Year's Day (observed)", date: '2027-01-04' }, // actual 2 Jan falls Saturday
  { name: 'Waitangi Day (observed)',  date: '2027-02-08' }, // actual 6 Feb falls Saturday
  { name: 'Good Friday',              date: '2027-03-26' },
  { name: 'Easter Monday',            date: '2027-03-29' },
  { name: 'Anzac Day (observed)',     date: '2027-04-26' }, // actual 25 Apr falls Sunday
  { name: "King's Birthday",          date: '2027-06-07' },
  { name: 'Matariki',                 date: '2027-06-25' },
  { name: 'Labour Day',               date: '2027-10-25' },
  { name: 'Christmas Day (observed)', date: '2027-12-27' }, // actual 25 Dec falls Saturday
  { name: 'Boxing Day (observed)',    date: '2027-12-28' }, // actual 26 Dec falls Sunday
];

/**
 * Parses a YYYY-MM-DD string into a UTC-midnight Date.
 *
 * Holidays are whole calendar days, not instants. Using UTC midnight keeps a
 * date stable regardless of the server's timezone — `new Date('2026-12-25')`
 * already parses as UTC, but constructing it explicitly makes the intent clear
 * and matches how the capacity engine keys days.
 */
export function toUtcDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Formats a Date as a YYYY-MM-DD key in UTC. */
export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Seeds NZ holidays on first use.
 *
 * Diffs against what's already stored rather than checking for an empty table,
 * so adding a future year to the list above is picked up on the next run without
 * duplicating or wiping what the user already has. (`createMany` cannot do this
 * for us — `skipDuplicates` is unsupported on SQLite.)
 */
async function seedDefaults() {
  const existing = await prisma.holiday.findMany({ select: { date: true } });
  const have = new Set(existing.map((h) => toDateKey(h.date)));
  const missing = NZ_HOLIDAYS.filter((h) => !have.has(h.date));
  if (missing.length === 0) return;
  await prisma.holiday.createMany({
    data: missing.map((h) => ({ name: h.name, date: toUtcDate(h.date) })),
  });
}

let seeded = false;
async function ensureSeeded() {
  if (seeded) return;
  await seedDefaults();
  seeded = true;
}

router.get('/', async (req: Request, res: Response) => {
  try {
    await ensureSeeded();
    const { from, to } = req.query;
    const where: any = {};
    if (typeof from === 'string' || typeof to === 'string') {
      where.date = {};
      if (typeof from === 'string') where.date.gte = toUtcDate(from);
      if (typeof to === 'string') where.date.lte = toUtcDate(to);
    }
    const holidays = await prisma.holiday.findMany({ where, orderBy: { date: 'asc' } });
    res.json(holidays);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, date } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ''))) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    }
    const holiday = await prisma.holiday.create({
      data: { name: name.trim(), date: toUtcDate(date) },
    });
    res.status(201).json(holiday);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'A holiday already exists on that date' });
    }
    res.status(500).json({ error: String(err) });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { name, date } = req.body;
    const data: any = {};
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ error: 'name cannot be empty' });
      data.name = String(name).trim();
    }
    if (date !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
        return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
      }
      data.date = toUtcDate(date);
    }
    const holiday = await prisma.holiday.update({ where: { id }, data });
    res.json(holiday);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'A holiday already exists on that date' });
    }
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Holiday not found' });
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.holiday.delete({ where: { id: String(req.params.id) } });
    res.status(204).end();
  } catch (err: any) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Holiday not found' });
    res.status(500).json({ error: String(err) });
  }
});

export default router;
