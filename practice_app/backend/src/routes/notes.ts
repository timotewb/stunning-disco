import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const router = Router();

// ── Shared helpers ────────────────────────────────────────────────────────────

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
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function dateToFilePath(date: string, notesDir: string): string {
  const [year, month] = date.split('-');
  return path.join(notesDir, `${year}${month}`, `${date}.md`);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function allNoteFiles(notesDir: string): { date: string; filePath: string }[] {
  if (!fs.existsSync(notesDir)) return [];
  const results: { date: string; filePath: string }[] = [];
  const monthDirs = fs.readdirSync(notesDir).filter((d) => /^\d{6}$/.test(d)).sort().reverse();
  for (const monthDir of monthDirs) {
    const monthPath = path.join(notesDir, monthDir);
    if (!fs.statSync(monthPath).isDirectory()) continue;
    const files = fs.readdirSync(monthPath).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().reverse();
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
    const idx = content.toLowerCase().indexOf(lower);
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

// ── Folder helpers (parameterized) ───────────────────────────────────────────

interface FolderMeta {
  name: string;
  notes: Record<string, string>; // slug → display name
}

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function nameToFolderSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'folder';
}

function validateFolderSlug(slug: string): boolean {
  return /^[a-z0-9_]+$/.test(slug);
}

function uniqueSlug(base: string, exists: (s: string) => boolean): string {
  if (!exists(base)) return base;
  let i = 2;
  while (exists(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

function readFolderMetaAt(baseDir: string, slug: string): FolderMeta {
  const p = path.join(baseDir, slug, '_meta.json');
  if (!fs.existsSync(p)) return { name: slug, notes: {} };
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) as FolderMeta; } catch { return { name: slug, notes: {} }; }
}

function writeFolderMetaAt(baseDir: string, slug: string, meta: FolderMeta): void {
  fs.writeFileSync(path.join(baseDir, slug, '_meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
}

function listFoldersAt(baseDir: string): { slug: string; name: string; notes: { slug: string; name: string }[] }[] {
  if (!fs.existsSync(baseDir)) return [];
  return fs.readdirSync(baseDir)
    .filter((d) => fs.statSync(path.join(baseDir, d)).isDirectory() && validateFolderSlug(d))
    .sort()
    .map((slug) => {
      const meta = readFolderMetaAt(baseDir, slug);
      const notes = Object.entries(meta.notes).map(([s, n]) => ({ slug: s, name: n }));
      return { slug, name: meta.name, notes };
    });
}

/**
 * Register folder CRUD routes at the given prefix.
 * getBaseDir receives the request and returns the filesystem base directory for
 * that context, or throws HttpError for invalid params.
 */
function registerFolderCRUD(
  r: Router,
  prefix: string,
  getBaseDir: (req: Request) => string,
): void {
  const handle = (fn: (req: Request, res: Response) => void) =>
    (req: Request, res: Response) => {
      try { fn(req, res); }
      catch (err) {
        if (err instanceof HttpError) res.status(err.status).json({ error: err.message });
        else res.status(500).json({ error: String(err) });
      }
    };

  // GET prefix — list folders
  r.get(prefix, handle((req, res) => res.json(listFoldersAt(getBaseDir(req)))));

  // POST prefix — create folder
  r.post(prefix, handle((req, res) => {
    const { name } = req.body as { name?: string };
    if (!name?.trim()) throw new HttpError(400, 'name is required');
    const baseDir = getBaseDir(req);
    const base = nameToFolderSlug(name.trim());
    const slug = uniqueSlug(base, (s) => new Set(listFoldersAt(baseDir).map((f) => f.slug)).has(s));
    ensureDir(path.join(baseDir, slug));
    writeFolderMetaAt(baseDir, slug, { name: name.trim(), notes: {} });
    res.status(201).json({ slug, name: name.trim(), notes: [] });
  }));

  // PATCH prefix/:folderSlug — rename folder
  r.patch(`${prefix}/:folderSlug`, handle((req, res) => {
    const folderSlug = String(req.params.folderSlug);
    if (!validateFolderSlug(folderSlug)) throw new HttpError(400, 'Invalid folder slug');
    const baseDir = getBaseDir(req);
    if (!fs.existsSync(path.join(baseDir, folderSlug))) throw new HttpError(404, 'Folder not found');
    const { name } = req.body as { name?: string };
    if (!name?.trim()) throw new HttpError(400, 'name is required');
    const meta = readFolderMetaAt(baseDir, folderSlug);
    meta.name = name.trim();
    writeFolderMetaAt(baseDir, folderSlug, meta);
    res.json({ slug: folderSlug, name: meta.name });
  }));

  // DELETE prefix/:folderSlug — delete folder
  r.delete(`${prefix}/:folderSlug`, handle((req, res) => {
    const folderSlug = String(req.params.folderSlug);
    if (!validateFolderSlug(folderSlug)) throw new HttpError(400, 'Invalid folder slug');
    const baseDir = getBaseDir(req);
    const dir = path.join(baseDir, folderSlug);
    if (!fs.existsSync(dir)) throw new HttpError(404, 'Folder not found');
    fs.rmSync(dir, { recursive: true, force: true });
    res.json({ ok: true });
  }));

  // POST prefix/:folderSlug/notes — create note
  r.post(`${prefix}/:folderSlug/notes`, handle((req, res) => {
    const folderSlug = String(req.params.folderSlug);
    if (!validateFolderSlug(folderSlug)) throw new HttpError(400, 'Invalid folder slug');
    const baseDir = getBaseDir(req);
    if (!fs.existsSync(path.join(baseDir, folderSlug))) throw new HttpError(404, 'Folder not found');
    const { name } = req.body as { name?: string };
    if (!name?.trim()) throw new HttpError(400, 'name is required');
    const meta = readFolderMetaAt(baseDir, folderSlug);
    const noteSlug = uniqueSlug(nameToFolderSlug(name.trim()), (s) => s in meta.notes);
    meta.notes[noteSlug] = name.trim();
    writeFolderMetaAt(baseDir, folderSlug, meta);
    fs.writeFileSync(path.join(baseDir, folderSlug, `${noteSlug}.md`), '', 'utf-8');
    res.status(201).json({ slug: noteSlug, name: name.trim(), content: '' });
  }));

  // GET prefix/:folderSlug/notes/:noteSlug — get note content
  r.get(`${prefix}/:folderSlug/notes/:noteSlug`, handle((req, res) => {
    const folderSlug = String(req.params.folderSlug);
    const noteSlug = String(req.params.noteSlug);
    if (!validateFolderSlug(folderSlug) || !validateFolderSlug(noteSlug)) throw new HttpError(400, 'Invalid slug');
    const baseDir = getBaseDir(req);
    if (!fs.existsSync(path.join(baseDir, folderSlug))) throw new HttpError(404, 'Folder not found');
    const meta = readFolderMetaAt(baseDir, folderSlug);
    const notePath = path.join(baseDir, folderSlug, `${noteSlug}.md`);
    const content = fs.existsSync(notePath) ? fs.readFileSync(notePath, 'utf-8') : '';
    res.json({ slug: noteSlug, name: meta.notes[noteSlug] ?? noteSlug, content });
  }));

  // PUT prefix/:folderSlug/notes/:noteSlug — save note content
  r.put(`${prefix}/:folderSlug/notes/:noteSlug`, handle((req, res) => {
    const folderSlug = String(req.params.folderSlug);
    const noteSlug = String(req.params.noteSlug);
    if (!validateFolderSlug(folderSlug) || !validateFolderSlug(noteSlug)) throw new HttpError(400, 'Invalid slug');
    const baseDir = getBaseDir(req);
    if (!fs.existsSync(path.join(baseDir, folderSlug))) throw new HttpError(404, 'Folder not found');
    const { content = '' } = req.body as { content?: string };
    const meta = readFolderMetaAt(baseDir, folderSlug);
    fs.writeFileSync(path.join(baseDir, folderSlug, `${noteSlug}.md`), content, 'utf-8');
    res.json({ slug: noteSlug, name: meta.notes[noteSlug] ?? noteSlug, content });
  }));

  // PATCH prefix/:folderSlug/notes/:noteSlug — rename note
  r.patch(`${prefix}/:folderSlug/notes/:noteSlug`, handle((req, res) => {
    const folderSlug = String(req.params.folderSlug);
    const noteSlug = String(req.params.noteSlug);
    if (!validateFolderSlug(folderSlug) || !validateFolderSlug(noteSlug)) throw new HttpError(400, 'Invalid slug');
    const baseDir = getBaseDir(req);
    if (!fs.existsSync(path.join(baseDir, folderSlug))) throw new HttpError(404, 'Folder not found');
    const { name } = req.body as { name?: string };
    if (!name?.trim()) throw new HttpError(400, 'name is required');
    const meta = readFolderMetaAt(baseDir, folderSlug);
    if (!(noteSlug in meta.notes)) throw new HttpError(404, 'Note not found');
    meta.notes[noteSlug] = name.trim();
    writeFolderMetaAt(baseDir, folderSlug, meta);
    res.json({ slug: noteSlug, name: name.trim() });
  }));

  // DELETE prefix/:folderSlug/notes/:noteSlug — delete note
  r.delete(`${prefix}/:folderSlug/notes/:noteSlug`, handle((req, res) => {
    const folderSlug = String(req.params.folderSlug);
    const noteSlug = String(req.params.noteSlug);
    if (!validateFolderSlug(folderSlug) || !validateFolderSlug(noteSlug)) throw new HttpError(400, 'Invalid slug');
    const baseDir = getBaseDir(req);
    if (!fs.existsSync(path.join(baseDir, folderSlug))) throw new HttpError(404, 'Folder not found');
    const meta = readFolderMetaAt(baseDir, folderSlug);
    delete meta.notes[noteSlug];
    writeFolderMetaAt(baseDir, folderSlug, meta);
    const notePath = path.join(baseDir, folderSlug, `${noteSlug}.md`);
    if (fs.existsSync(notePath)) fs.unlinkSync(notePath);
    res.json({ ok: true });
  }));

  // POST prefix/:folderSlug/notes/:noteSlug/move — move note
  r.post(`${prefix}/:folderSlug/notes/:noteSlug/move`, handle((req, res) => {
    const folderSlug = String(req.params.folderSlug);
    const noteSlug = String(req.params.noteSlug);
    const { targetFolderSlug } = req.body as { targetFolderSlug?: string };
    if (!validateFolderSlug(folderSlug) || !validateFolderSlug(noteSlug)) throw new HttpError(400, 'Invalid slug');
    if (!targetFolderSlug || !validateFolderSlug(targetFolderSlug)) throw new HttpError(400, 'targetFolderSlug is required');
    if (folderSlug === targetFolderSlug) throw new HttpError(400, 'Source and target are the same');
    const baseDir = getBaseDir(req);
    if (!fs.existsSync(path.join(baseDir, folderSlug))) throw new HttpError(404, 'Source folder not found');
    if (!fs.existsSync(path.join(baseDir, targetFolderSlug))) throw new HttpError(404, 'Target folder not found');
    const srcMeta = readFolderMetaAt(baseDir, folderSlug);
    if (!(noteSlug in srcMeta.notes)) throw new HttpError(404, 'Note not found');
    const noteName = srcMeta.notes[noteSlug];
    const tgtMeta = readFolderMetaAt(baseDir, targetFolderSlug);
    const newSlug = uniqueSlug(noteSlug, (s) => s in tgtMeta.notes);
    const srcPath = path.join(baseDir, folderSlug, `${noteSlug}.md`);
    const content = fs.existsSync(srcPath) ? fs.readFileSync(srcPath, 'utf-8') : '';
    fs.writeFileSync(path.join(baseDir, targetFolderSlug, `${newSlug}.md`), content, 'utf-8');
    tgtMeta.notes[newSlug] = noteName;
    writeFolderMetaAt(baseDir, targetFolderSlug, tgtMeta);
    delete srcMeta.notes[noteSlug];
    writeFolderMetaAt(baseDir, folderSlug, srcMeta);
    if (fs.existsSync(srcPath)) fs.unlinkSync(srcPath);
    res.json({ ok: true, newSlug, targetFolderSlug });
  }));
}

// ── Route registrations ───────────────────────────────────────────────────────
// Order matters: specific paths MUST come before wildcard /:date or /:slug/:date

// Daily notes list + search
router.get('/', (_req, res) => {
  try { res.json(allNoteFiles(getNotesDir()).map(({ date }) => ({ date }))); }
  catch (err) { res.status(500).json({ error: String(err) }); }
});
router.get('/search', (req, res) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (!q) return res.json([]);
    res.json(searchInDir(getNotesDir(), q));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// Global folders tab  ← must be before /:date
registerFolderCRUD(router, '/folders', () => path.join(getNotesDir(), 'folders'));

// Daily-context folders  ← must be before /:date
registerFolderCRUD(router, '/daily-folders', () => path.join(getNotesDir(), 'daily_folders'));

// Daily note wildcard routes
router.get('/:date', (req, res) => {
  try {
    const date = String(req.params.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date format, expected yyyy-mm-dd' });
    const filePath = dateToFilePath(date, getNotesDir());
    const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
    res.json({ date, content });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});
router.put('/:date', (req, res) => {
  try {
    const date = String(req.params.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date format, expected yyyy-mm-dd' });
    const { content = '' } = req.body;
    const filePath = dateToFilePath(date, getNotesDir());
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, content, 'utf-8');
    res.json({ date, content });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Member notes ──────────────────────────────────────────────────────────────

function memberNotesDir(slug: string): string {
  return path.join(getNotesDir(), 'members', slug);
}

function validateSlug(slug: string): boolean {
  return /^[a-z0-9_]+$/.test(slug);
}

// Member list + search  ← before member /:date wildcard
router.get('/members/:slug', (req, res) => {
  try {
    const slug = String(req.params.slug);
    if (!validateSlug(slug)) return res.status(400).json({ error: 'Invalid slug' });
    res.json(allNoteFiles(memberNotesDir(slug)).map(({ date }) => ({ date })));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});
router.get('/members/:slug/search', (req, res) => {
  try {
    const slug = String(req.params.slug);
    if (!validateSlug(slug)) return res.status(400).json({ error: 'Invalid slug' });
    const q = String(req.query.q ?? '').trim();
    if (!q) return res.json([]);
    res.json(searchInDir(memberNotesDir(slug), q));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// Member-context folders  ← must be before /members/:slug/:date
registerFolderCRUD(router, '/members/:memberSlug/folders', (req) => {
  const memberSlug = String(req.params.memberSlug);
  if (!validateSlug(memberSlug)) throw new HttpError(400, 'Invalid member slug');
  return path.join(getNotesDir(), 'members', memberSlug, 'folders');
});

// Member date wildcard routes
router.get('/members/:slug/:date', (req, res) => {
  try {
    const slug = String(req.params.slug);
    const date = String(req.params.date);
    if (!validateSlug(slug)) return res.status(400).json({ error: 'Invalid slug' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date format, expected yyyy-mm-dd' });
    const filePath = dateToFilePath(date, memberNotesDir(slug));
    const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
    res.json({ date, content });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});
router.put('/members/:slug/:date', (req, res) => {
  try {
    const slug = String(req.params.slug);
    const date = String(req.params.date);
    if (!validateSlug(slug)) return res.status(400).json({ error: 'Invalid slug' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date format, expected yyyy-mm-dd' });
    const { content = '' } = req.body;
    const filePath = dateToFilePath(date, memberNotesDir(slug));
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, content, 'utf-8');
    res.json({ date, content });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

export default router;

// ── Image helpers ─────────────────────────────────────────────────────────────

export function getImagesDir(): string {
  const dbUrl = process.env.DATABASE_URL ?? 'file:/app/data/practice.db';
  const dbPath = dbUrl.replace(/^file:/, '');
  const absoluteDbPath = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
  return path.join(path.dirname(absoluteDbPath), 'images');
}

const MIME_TO_EXT: Record<string, string> = {
  'image/png':  '.png',
  'image/jpeg': '.jpg',
  'image/jpg':  '.jpg',
  'image/gif':  '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

// POST /api/notes/images — accept a base64-encoded image, save it, return the URL
router.post('/images', (req: Request, res: Response) => {
  try {
    const { base64, mimeType } = req.body as { base64?: string; mimeType?: string };
    if (!base64 || !mimeType) return res.status(400).json({ error: 'base64 and mimeType are required' });

    const ext = MIME_TO_EXT[mimeType] ?? '.png';
    const filename = `img_${crypto.randomUUID()}${ext}`;
    const imagesDir = getImagesDir();
    fs.mkdirSync(imagesDir, { recursive: true });
    fs.writeFileSync(path.join(imagesDir, filename), Buffer.from(base64, 'base64'));

    res.json({ filename, url: `/api/notes/images/${filename}` });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/notes/images/cleanup — delete image files not referenced in any note
router.post('/images/cleanup', (_req: Request, res: Response) => {
  try {
    const imagesDir = getImagesDir();
    if (!fs.existsSync(imagesDir)) return res.json({ deleted: 0 });

    // Collect all image filenames on disk
    const onDisk = new Set(fs.readdirSync(imagesDir).filter(f => /^img_/.test(f)));
    if (onDisk.size === 0) return res.json({ deleted: 0 });

    // Walk all note files and collect referenced filenames
    const referenced = new Set<string>();
    const imageRefRegex = /\/api\/notes\/images\/(img_[^\s)"']+)/g;

    function scanDir(dir: string) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          let m: RegExpExecArray | null;
          while ((m = imageRefRegex.exec(content)) !== null) referenced.add(m[1]);
          imageRefRegex.lastIndex = 0;
        }
      }
    }

    scanDir(getNotesDir());

    // Delete unreferenced images
    let deleted = 0;
    for (const filename of onDisk) {
      if (!referenced.has(filename)) {
        fs.unlinkSync(path.join(imagesDir, filename));
        deleted++;
      }
    }

    res.json({ deleted });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/notes/images/:filename — serve an image file
router.get('/images/:filename', (req: Request, res: Response) => {
  try {
    const filename = path.basename(String(req.params.filename)); // prevent path traversal
    const filepath = path.join(getImagesDir(), filename);
    if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Image not found' });

    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    };
    res.setHeader('Content-Type', mimeTypes[ext] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(fs.readFileSync(filepath));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
