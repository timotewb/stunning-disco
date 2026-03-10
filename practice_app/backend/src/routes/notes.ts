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

// GET /api/notes — list all note dates newest first
router.get('/', (_req: Request, res: Response) => {
  try {
    const notes = allNoteFiles(getNotesDir()).map(({ date }) => ({ date }));
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/notes/search?q=... — keyword search across all notes
router.get('/search', (req: Request, res: Response) => {
  try {
    const q = String(req.query.q ?? '').trim().toLowerCase();
    if (!q) return res.json([]);

    const results: { date: string; snippet: string }[] = [];
    for (const { date, filePath } of allNoteFiles(getNotesDir())) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lower = content.toLowerCase();
      const idx = lower.indexOf(q);
      if (idx !== -1) {
        const start = Math.max(0, idx - 60);
        const end = Math.min(content.length, idx + q.length + 60);
        const snippet =
          (start > 0 ? '…' : '') +
          content.slice(start, end).replace(/\n+/g, ' ').trim() +
          (end < content.length ? '…' : '');
        results.push({ date, snippet });
      }
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/notes/:date — get note content (empty string if not exists)
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

// PUT /api/notes/:date — create or overwrite a note
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

export default router;
