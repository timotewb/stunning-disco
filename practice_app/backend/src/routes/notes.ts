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

// ── Folder notes — registered BEFORE /:date to prevent wildcard collision ────

// GET /api/notes/folders — list all folders and their notes
router.get('/folders', (_req: Request, res: Response) => {
  try {
    res.json(listFolders());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/notes/folders — create folder { name }
router.post('/folders', (req: Request, res: Response) => {
  try {
    const { name } = req.body as { name?: string };
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const base = nameToFolderSlug(name.trim());
    const existingSlugs = new Set(listFolders().map((f) => f.slug));
    const slug = uniqueSlug(base, (s) => existingSlugs.has(s));
    const dir = folderDir(slug);
    ensureDir(dir);
    writeFolderMeta(slug, { name: name.trim(), notes: {} });
    res.status(201).json({ slug, name: name.trim(), notes: [] });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PATCH /api/notes/folders/:folderSlug — rename folder { name }
router.patch('/folders/:folderSlug', (req: Request, res: Response) => {
  try {
    const folderSlug = String(req.params.folderSlug);
    if (!validateFolderSlug(folderSlug)) return res.status(400).json({ error: 'Invalid folder slug' });
    if (!fs.existsSync(folderDir(folderSlug))) return res.status(404).json({ error: 'Folder not found' });
    const { name } = req.body as { name?: string };
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const meta = readFolderMeta(folderSlug);
    meta.name = name.trim();
    writeFolderMeta(folderSlug, meta);
    res.json({ slug: folderSlug, name: meta.name });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/notes/folders/:folderSlug — delete folder and all contents
router.delete('/folders/:folderSlug', (req: Request, res: Response) => {
  try {
    const folderSlug = String(req.params.folderSlug);
    if (!validateFolderSlug(folderSlug)) return res.status(400).json({ error: 'Invalid folder slug' });
    const dir = folderDir(folderSlug);
    if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Folder not found' });
    fs.rmSync(dir, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/notes/folders/:folderSlug/notes — create note { name }
router.post('/folders/:folderSlug/notes', (req: Request, res: Response) => {
  try {
    const folderSlug = String(req.params.folderSlug);
    if (!validateFolderSlug(folderSlug)) return res.status(400).json({ error: 'Invalid folder slug' });
    if (!fs.existsSync(folderDir(folderSlug))) return res.status(404).json({ error: 'Folder not found' });
    const { name } = req.body as { name?: string };
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const meta = readFolderMeta(folderSlug);
    const base = nameToFolderSlug(name.trim());
    const noteSlug = uniqueSlug(base, (s) => s in meta.notes);
    meta.notes[noteSlug] = name.trim();
    writeFolderMeta(folderSlug, meta);
    fs.writeFileSync(path.join(folderDir(folderSlug), `${noteSlug}.md`), '', 'utf-8');
    res.status(201).json({ slug: noteSlug, name: name.trim(), content: '' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/notes/folders/:folderSlug/notes/:noteSlug — get note content
router.get('/folders/:folderSlug/notes/:noteSlug', (req: Request, res: Response) => {
  try {
    const folderSlug = String(req.params.folderSlug);
    const noteSlug = String(req.params.noteSlug);
    if (!validateFolderSlug(folderSlug) || !validateFolderSlug(noteSlug)) {
      return res.status(400).json({ error: 'Invalid slug' });
    }
    if (!fs.existsSync(folderDir(folderSlug))) return res.status(404).json({ error: 'Folder not found' });
    const meta = readFolderMeta(folderSlug);
    const notePath = path.join(folderDir(folderSlug), `${noteSlug}.md`);
    const content = fs.existsSync(notePath) ? fs.readFileSync(notePath, 'utf-8') : '';
    res.json({ slug: noteSlug, name: meta.notes[noteSlug] ?? noteSlug, content });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/notes/folders/:folderSlug/notes/:noteSlug — save note content
router.put('/folders/:folderSlug/notes/:noteSlug', (req: Request, res: Response) => {
  try {
    const folderSlug = String(req.params.folderSlug);
    const noteSlug = String(req.params.noteSlug);
    if (!validateFolderSlug(folderSlug) || !validateFolderSlug(noteSlug)) {
      return res.status(400).json({ error: 'Invalid slug' });
    }
    if (!fs.existsSync(folderDir(folderSlug))) return res.status(404).json({ error: 'Folder not found' });
    const { content = '' } = req.body as { content?: string };
    const meta = readFolderMeta(folderSlug);
    const notePath = path.join(folderDir(folderSlug), `${noteSlug}.md`);
    fs.writeFileSync(notePath, content, 'utf-8');
    res.json({ slug: noteSlug, name: meta.notes[noteSlug] ?? noteSlug, content });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PATCH /api/notes/folders/:folderSlug/notes/:noteSlug — rename note { name }
router.patch('/folders/:folderSlug/notes/:noteSlug', (req: Request, res: Response) => {
  try {
    const folderSlug = String(req.params.folderSlug);
    const noteSlug = String(req.params.noteSlug);
    if (!validateFolderSlug(folderSlug) || !validateFolderSlug(noteSlug)) {
      return res.status(400).json({ error: 'Invalid slug' });
    }
    if (!fs.existsSync(folderDir(folderSlug))) return res.status(404).json({ error: 'Folder not found' });
    const { name } = req.body as { name?: string };
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const meta = readFolderMeta(folderSlug);
    if (!(noteSlug in meta.notes)) return res.status(404).json({ error: 'Note not found' });
    meta.notes[noteSlug] = name.trim();
    writeFolderMeta(folderSlug, meta);
    res.json({ slug: noteSlug, name: name.trim() });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/notes/folders/:folderSlug/notes/:noteSlug — delete note
router.delete('/folders/:folderSlug/notes/:noteSlug', (req: Request, res: Response) => {
  try {
    const folderSlug = String(req.params.folderSlug);
    const noteSlug = String(req.params.noteSlug);
    if (!validateFolderSlug(folderSlug) || !validateFolderSlug(noteSlug)) {
      return res.status(400).json({ error: 'Invalid slug' });
    }
    if (!fs.existsSync(folderDir(folderSlug))) return res.status(404).json({ error: 'Folder not found' });
    const meta = readFolderMeta(folderSlug);
    delete meta.notes[noteSlug];
    writeFolderMeta(folderSlug, meta);
    const notePath = path.join(folderDir(folderSlug), `${noteSlug}.md`);
    if (fs.existsSync(notePath)) fs.unlinkSync(notePath);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/notes/folders/:folderSlug/notes/:noteSlug/move — move note { targetFolderSlug }
router.post('/folders/:folderSlug/notes/:noteSlug/move', (req: Request, res: Response) => {
  try {
    const folderSlug = String(req.params.folderSlug);
    const noteSlug = String(req.params.noteSlug);
    const { targetFolderSlug } = req.body as { targetFolderSlug?: string };
    if (!validateFolderSlug(folderSlug) || !validateFolderSlug(noteSlug)) {
      return res.status(400).json({ error: 'Invalid slug' });
    }
    if (!targetFolderSlug || !validateFolderSlug(targetFolderSlug)) {
      return res.status(400).json({ error: 'targetFolderSlug is required' });
    }
    if (folderSlug === targetFolderSlug) return res.status(400).json({ error: 'Source and target are the same' });
    if (!fs.existsSync(folderDir(folderSlug))) return res.status(404).json({ error: 'Source folder not found' });
    if (!fs.existsSync(folderDir(targetFolderSlug))) return res.status(404).json({ error: 'Target folder not found' });
    const srcMeta = readFolderMeta(folderSlug);
    if (!(noteSlug in srcMeta.notes)) return res.status(404).json({ error: 'Note not found' });
    const noteName = srcMeta.notes[noteSlug];
    const tgtMeta = readFolderMeta(targetFolderSlug);
    const newSlug = uniqueSlug(noteSlug, (s) => s in tgtMeta.notes);
    const srcPath = path.join(folderDir(folderSlug), `${noteSlug}.md`);
    const tgtPath = path.join(folderDir(targetFolderSlug), `${newSlug}.md`);
    const content = fs.existsSync(srcPath) ? fs.readFileSync(srcPath, 'utf-8') : '';
    fs.writeFileSync(tgtPath, content, 'utf-8');
    tgtMeta.notes[newSlug] = noteName;
    writeFolderMeta(targetFolderSlug, tgtMeta);
    delete srcMeta.notes[noteSlug];
    writeFolderMeta(folderSlug, srcMeta);
    if (fs.existsSync(srcPath)) fs.unlinkSync(srcPath);
    res.json({ ok: true, newSlug, targetFolderSlug });
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

// ── Folder notes helpers ──────────────────────────────────────────────────────

interface FolderMeta {
  name: string;
  notes: Record<string, string>; // slug → display name
}

function foldersDir(): string {
  return path.join(getNotesDir(), 'folders');
}

function folderDir(folderSlug: string): string {
  return path.join(foldersDir(), folderSlug);
}

function folderMetaPath(folderSlug: string): string {
  return path.join(folderDir(folderSlug), '_meta.json');
}

function readFolderMeta(folderSlug: string): FolderMeta {
  const p = folderMetaPath(folderSlug);
  if (!fs.existsSync(p)) return { name: folderSlug, notes: {} };
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) as FolderMeta; } catch { return { name: folderSlug, notes: {} }; }
}

function writeFolderMeta(folderSlug: string, meta: FolderMeta): void {
  fs.writeFileSync(folderMetaPath(folderSlug), JSON.stringify(meta, null, 2), 'utf-8');
}

function nameToFolderSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'folder';
}

function uniqueSlug(base: string, exists: (s: string) => boolean): string {
  if (!exists(base)) return base;
  let i = 2;
  while (exists(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

function validateFolderSlug(slug: string): boolean {
  return /^[a-z0-9_]+$/.test(slug);
}

function listFolders(): { slug: string; name: string; notes: { slug: string; name: string }[] }[] {
  const dir = foldersDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((d) => {
      const full = path.join(dir, d);
      return fs.statSync(full).isDirectory() && validateFolderSlug(d);
    })
    .sort()
    .map((slug) => {
      const meta = readFolderMeta(slug);
      const notes = Object.entries(meta.notes).map(([s, n]) => ({ slug: s, name: n }));
      return { slug, name: meta.name, notes };
    });
}

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
