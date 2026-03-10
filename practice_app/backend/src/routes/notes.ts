import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

function getNotesDir(): string {
  const dbUrl = process.env.DATABASE_URL ?? 'file:/app/data/practice.db';
  const dbPath = dbUrl.replace(/^file:/, '');
  const absoluteDbPath = path.isAbsolute(dbPath)
    ? dbPath
    : path.resolve(process.cwd(), dbPath);
  return path.join(path.dirname(absoluteDbPath), 'notes');
}

/** Sanitise a team member name to a safe directory slug: lowercase [a-z0-9_] only */
export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function dateToFilePath(date: string, notesDir: string): string {
  const [year, month] = date.split('-');
  return path.join(notesDir, `${year}${month}`, `${date}.md`);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function allNoteFiles(notesDir: string): { date: string; filePath: string }[] {
  if (!fs.existsSync(notesDir)) return [];
  const results: { date: string; filePath: string }[] = [];
  const monthDirs = fs.readdirSync(notesDir)
    .filter((d) => /^\d{6}$/.test(d))
    .sort()
    .reverse();
  for (const monthDir of monthDirs) {
    const monthPath = path.join(notesDir, monthDir);
    if (!fs.statSync(monthPath).isDirectory()) continue;
    const files = fs.readdirSync(monthPath)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .reverse();
    for (const file of files) {
      results.push({ date: file.replace('.md', ''), filePath: path.join(monthPath, file) });
    }
  }
  return results;
}

function searchInDir(notesDir: string, q: string): { date: string; snippet: string }[] {
  const lower = q.toLowerCase();
  const results: { date: string; snippet: string }[] = [];
  for (const { date, filePath } of allNoteFiles(notesDir)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lowerContent = content.toLowerCase();
    const idx = lowerContent.indexOf(lower);
    if (idx !== -1) {
      const start = Math.max(0, idx - 60);
      const end = Math.min(content.length, idx + lower.length + 60);
      const snippet =
        (start > 0 ? '…' : '') +
        content.slice(start, end).replace(/\n+/g, ' ').trim() +
        (end < content.length ? '…' : '');
      results.push({ date, snippet });
    }
  }
  return results;
}

// ── Daily notes ──────────────────────────────────────────────────────────────

// GET /api/notes — list all note dates newest first
router.get('/', (_req: Request, res: Response) => {
  try {
    const notes = allNoteFiles(getNotesDir()).map(({ date }) => ({ date }));
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/notes/search?q=... — keyword search across daily notes
router.get('/search', (req: Request, res: Response) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (!q) return res.json([]);
    res.json(searchInDir(getNotesDir(), q));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/notes/:date — get daily note content
router.get('/:date', (req: Request, res: Response) => {
  try {
    const date = String(req.params.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format, expected yyyy-mm-dd' });
    }
    const filePath = dateToFilePath(date, getNotesDir());
    const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
    res.json({ date, content });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/notes/:date — create or overwrite a daily note
router.put('/:date', (req: Request, res: Response) => {
  try {
    const date = String(req.params.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format, expected yyyy-mm-dd' });
    }
    const { content = '' } = req.body;
    const filePath = dateToFilePath(date, getNotesDir());
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, content, 'utf-8');
    res.json({ date, content });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Member notes ─────────────────────────────────────────────────────────────

function memberNotesDir(slug: string): string {
  return path.join(getNotesDir(), 'members', slug);
}

function validateSlug(slug: string): boolean {
  return /^[a-z0-9_]+$/.test(slug);
}

// GET /api/notes/members/:slug — list all note dates for a member
router.get('/members/:slug', (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    if (!validateSlug(slug)) return res.status(400).json({ error: 'Invalid slug' });
    const notes = allNoteFiles(memberNotesDir(slug)).map(({ date }) => ({ date }));
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/notes/members/:slug/search?q= — search member notes
router.get('/members/:slug/search', (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    if (!validateSlug(slug)) return res.status(400).json({ error: 'Invalid slug' });
    const q = String(req.query.q ?? '').trim();
    if (!q) return res.json([]);
    res.json(searchInDir(memberNotesDir(slug), q));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/notes/members/:slug/:date — get member note content
router.get('/members/:slug/:date', (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    const date = String(req.params.date);
    if (!validateSlug(slug)) return res.status(400).json({ error: 'Invalid slug' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format, expected yyyy-mm-dd' });
    }
    const filePath = dateToFilePath(date, memberNotesDir(slug));
    const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
    res.json({ date, content });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/notes/members/:slug/:date — create or overwrite member note
router.put('/members/:slug/:date', (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    const date = String(req.params.date);
    if (!validateSlug(slug)) return res.status(400).json({ error: 'Invalid slug' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format, expected yyyy-mm-dd' });
    }
    const { content = '' } = req.body;
    const filePath = dateToFilePath(date, memberNotesDir(slug));
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, content, 'utf-8');
    res.json({ date, content });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
