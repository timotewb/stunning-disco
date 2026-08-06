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

const META_FILENAME = '_meta.json';

/** File extensions we can safely render in the plain-text editor/preview. */
const TEXT_EXTENSIONS = new Set([
  '.md', '.markdown', '.txt', '.text', '.csv', '.tsv', '.json', '.jsonl',
  '.yml', '.yaml', '.xml', '.html', '.htm', '.css', '.scss', '.log', '.ini',
  '.cfg', '.conf', '.toml', '.env', '.sql', '.sh', '.bash', '.zsh', '.ps1',
  '.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.go', '.rs', '.java', '.c',
  '.h', '.cpp', '.cs', '.php', '.pl', '.r', '.svg',
]);

/** A file is previewable/editable only when its extension is known plain text. */
function isEditableFile(file: string): boolean {
  return TEXT_EXTENSIONS.has(path.extname(file).toLowerCase());
}

/** Note entry as normalised in memory. `file` is the real, untouched filename. */
interface NoteEntry {
  name: string;
  file: string;
}

/**
 * Folder metadata as normalised in memory.
 * On disk, a note value may be either the legacy `"Display Name"` string
 * (implying a `<slug>.md` file) or the richer `{ name, file }` object used for
 * files that were added manually and whose filename we must not change.
 */
interface FolderMeta {
  name: string;
  notes: Record<string, NoteEntry>;
}

type RawNoteValue = string | { name?: string; file?: string };

interface RawFolderMeta {
  name?: string;
  notes?: Record<string, RawNoteValue>;
}

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function nameToFolderSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'folder';
}

/** Note slugs stay strictly URL-safe; folder path segments are validated separately. */
function validateFolderSlug(slug: string): boolean {
  return /^[a-z0-9_]+$/.test(slug);
}

function uniqueSlug(base: string, exists: (s: string) => boolean): string {
  if (!exists(base)) return base;
  let i = 2;
  while (exists(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

/** Turn a raw filename stem into a readable display name: `design-doc` → `Design Doc`. */
function prettifyFileName(stem: string): string {
  const words = stem.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!words) return stem;
  return words.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// ── Nested folder path handling ──────────────────────────────────────────────
//
// A folder is addressed by its path relative to the context base directory.
// Segments are URI-encoded and joined with `~`, e.g. `databricks~unity_catalog`.
// Single-segment paths are byte-identical to the slugs used before nesting
// existed, so every previously issued URL keeps working.

const PATH_SEPARATOR = '~';

/**
 * Build the wire form of a folder path. Segments are URI-encoded so characters
 * like spaces survive transport; `~` stays literal as the separator.
 */
function encodeFolderPath(segments: string[]): string {
  return segments.map((s) => encodeURIComponent(s)).join(PATH_SEPARATOR);
}

function assertValidSegments(segments: string[]): string[] {
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..' || /[/\\\0]/.test(segment)) {
      throw new HttpError(400, 'Invalid folder path');
    }
  }
  return segments;
}

/**
 * Split a folder path into raw directory names.
 *
 * Express already percent-decodes route parameters, so a path taken from the
 * URL must NOT be decoded a second time. A path taken from a JSON body is still
 * in its wire form and does need decoding — hence the explicit flag.
 */
function splitFolderPath(value: string, opts: { decodeSegments: boolean }): string[] {
  const parts = value.split(PATH_SEPARATOR).map((s) => {
    if (!opts.decodeSegments) return s;
    try { return decodeURIComponent(s); } catch { throw new HttpError(400, 'Invalid folder path'); }
  });
  return assertValidSegments(parts);
}

/** A path param arrives already decoded by Express. */
const pathFromParam = (value: string) => splitFolderPath(value, { decodeSegments: false });
/** A path in a JSON body is still in its encoded wire form. */
const pathFromBody = (value: string) => splitFolderPath(value, { decodeSegments: true });

/**
 * Resolve folder path segments to an absolute directory, guaranteeing the
 * result stays inside `baseDir` even if a segment slips past validation.
 */
function resolveFolderDir(baseDir: string, segments: string[]): string {
  const dir = path.resolve(baseDir, ...segments);
  const root = path.resolve(baseDir);
  if (dir !== root && !dir.startsWith(root + path.sep)) throw new HttpError(400, 'Invalid folder path');
  return dir;
}

function requireFolderDir(baseDir: string, segments: string[], label = 'Folder'): string {
  const dir = resolveFolderDir(baseDir, segments);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new HttpError(404, `${label} not found`);
  return dir;
}

// ── Folder metadata ──────────────────────────────────────────────────────────

function readFolderMeta(dir: string): FolderMeta {
  const fallbackName = path.basename(dir);
  const metaPath = path.join(dir, META_FILENAME);
  if (!fs.existsSync(metaPath)) return { name: fallbackName, notes: {} };

  let raw: RawFolderMeta;
  try { raw = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as RawFolderMeta; }
  catch { return { name: fallbackName, notes: {} }; }

  const notes: Record<string, NoteEntry> = {};
  for (const [slug, value] of Object.entries(raw.notes ?? {})) {
    if (typeof value === 'string') {
      notes[slug] = { name: value, file: `${slug}.md` };
    } else if (value && typeof value === 'object') {
      // basename() ensures a hand-edited meta file can never escape the folder.
      const file = path.basename(value.file ?? `${slug}.md`);
      notes[slug] = { name: value.name ?? slug, file };
    }
  }
  return { name: raw.name ?? fallbackName, notes };
}

function writeFolderMeta(dir: string, meta: FolderMeta): void {
  // Entries whose file is the conventional `<slug>.md` are written back in the
  // legacy string form so existing folders are never needlessly rewritten.
  const notes: Record<string, RawNoteValue> = {};
  for (const [slug, entry] of Object.entries(meta.notes)) {
    notes[slug] = entry.file === `${slug}.md` ? entry.name : { name: entry.name, file: entry.file };
  }
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, META_FILENAME), JSON.stringify({ name: meta.name, notes }, null, 2), 'utf-8');
}

function noteDTOs(meta: FolderMeta): { slug: string; name: string; file: string; editable: boolean }[] {
  return Object.entries(meta.notes).map(([slug, entry]) => ({
    slug, name: entry.name, file: entry.file, editable: isEditableFile(entry.file),
  }));
}

interface FolderDTO {
  slug: string;
  path: string;
  name: string;
  notes: { slug: string; name: string; file: string; editable: boolean }[];
  children: FolderDTO[];
}

/**
 * List folders under `baseDir` recursively. Subdirectories are read straight
 * from disk, so a manually created nested directory appears without a refresh;
 * only its *files* need the refresh action to be indexed into `_meta.json`.
 */
function listFoldersAt(baseDir: string, parentSegments: string[] = []): FolderDTO[] {
  const dir = path.join(baseDir, ...parentSegments);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    // `~` is the path separator, so a directory containing one is not addressable.
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.includes(PATH_SEPARATOR))
    .map((e) => e.name)
    .sort()
    .map((segment) => {
      const segments = [...parentSegments, segment];
      const meta = readFolderMeta(path.join(baseDir, ...segments));
      return {
        slug: segment,
        path: encodeFolderPath(segments),
        name: meta.name,
        notes: noteDTOs(meta),
        children: listFoldersAt(baseDir, segments),
      };
    });
}

/**
 * Reconcile `_meta.json` with what is actually on disk, recursing into every
 * subfolder. Files are never renamed or moved: unknown files are indexed under
 * a generated URL-safe slug that points at the original filename.
 */
function refreshFolderTree(dir: string): { added: number; removed: number; foldersAdded: number } {
  const stats = { added: 0, removed: 0, foldersAdded: 0 };
  const meta = readFolderMeta(dir);
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  const filesOnDisk = new Set(
    entries.filter((e) => e.isFile() && e.name !== META_FILENAME && !e.name.startsWith('.')).map((e) => e.name)
  );

  for (const [slug, entry] of Object.entries(meta.notes)) {
    if (!filesOnDisk.has(entry.file)) { delete meta.notes[slug]; stats.removed++; }
  }

  const indexed = new Set(Object.values(meta.notes).map((n) => n.file));
  for (const file of [...filesOnDisk].sort()) {
    if (indexed.has(file)) continue;
    const stem = path.basename(file, path.extname(file));
    const slug = uniqueSlug(nameToFolderSlug(stem), (s) => s in meta.notes);
    meta.notes[slug] = { name: prettifyFileName(stem), file };
    stats.added++;
  }

  writeFolderMeta(dir, meta);

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name.includes(PATH_SEPARATOR)) continue;
    const childDir = path.join(dir, entry.name);
    if (!fs.existsSync(path.join(childDir, META_FILENAME))) {
      // First time we've seen this directory — give it a readable display name.
      writeFolderMeta(childDir, { name: prettifyFileName(entry.name), notes: {} });
      stats.foldersAdded++;
    }
    const childStats = refreshFolderTree(childDir);
    stats.added += childStats.added;
    stats.removed += childStats.removed;
    stats.foldersAdded += childStats.foldersAdded;
  }

  return stats;
}

/** Resolve a note slug to its absolute file path within an already-resolved folder. */
function noteFilePath(dir: string, meta: FolderMeta, slug: string): string {
  const entry = meta.notes[slug];
  return path.join(dir, entry ? entry.file : `${slug}.md`);
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

  // GET prefix — list folders (recursive)
  r.get(prefix, handle((req, res) => res.json(listFoldersAt(getBaseDir(req)))));

  // POST prefix — create folder
  r.post(prefix, handle((req, res) => {
    const { name, parentPath } = req.body as { name?: string; parentPath?: string };
    if (!name?.trim()) throw new HttpError(400, 'name is required');
    const baseDir = getBaseDir(req);
    const parentSegments = parentPath ? pathFromBody(parentPath) : [];
    const parentDir = parentPath ? requireFolderDir(baseDir, parentSegments, 'Parent folder') : baseDir;
    const base = nameToFolderSlug(name.trim());
    const slug = uniqueSlug(base, (s) => fs.existsSync(path.join(parentDir, s)));
    const dir = path.join(parentDir, slug);
    ensureDir(dir);
    writeFolderMeta(dir, { name: name.trim(), notes: {} });
    res.status(201).json({
      slug, path: encodeFolderPath([...parentSegments, slug]), name: name.trim(), notes: [], children: [],
    });
  }));

  // POST prefix/:folderPath/refresh — reconcile _meta.json with the file system
  r.post(`${prefix}/:folderPath/refresh`, handle((req, res) => {
    const baseDir = getBaseDir(req);
    const dir = requireFolderDir(baseDir, pathFromParam(String(req.params.folderPath)));
    res.json(refreshFolderTree(dir));
  }));

  // PATCH prefix/:folderPath — rename folder
  r.patch(`${prefix}/:folderPath`, handle((req, res) => {
    const baseDir = getBaseDir(req);
    const segments = pathFromParam(String(req.params.folderPath));
    const dir = requireFolderDir(baseDir, segments);
    const { name } = req.body as { name?: string };
    if (!name?.trim()) throw new HttpError(400, 'name is required');
    const meta = readFolderMeta(dir);
    meta.name = name.trim();
    writeFolderMeta(dir, meta);
    res.json({ slug: path.basename(dir), path: encodeFolderPath(segments), name: meta.name });
  }));

  // DELETE prefix/:folderPath — delete folder
  r.delete(`${prefix}/:folderPath`, handle((req, res) => {
    const baseDir = getBaseDir(req);
    const dir = requireFolderDir(baseDir, pathFromParam(String(req.params.folderPath)));
    fs.rmSync(dir, { recursive: true, force: true });
    res.json({ ok: true });
  }));

  // POST prefix/:folderPath/notes — create note
  r.post(`${prefix}/:folderPath/notes`, handle((req, res) => {
    const baseDir = getBaseDir(req);
    const dir = requireFolderDir(baseDir, pathFromParam(String(req.params.folderPath)));
    const { name } = req.body as { name?: string };
    if (!name?.trim()) throw new HttpError(400, 'name is required');
    const meta = readFolderMeta(dir);
    const noteSlug = uniqueSlug(nameToFolderSlug(name.trim()), (s) => s in meta.notes);
    meta.notes[noteSlug] = { name: name.trim(), file: `${noteSlug}.md` };
    writeFolderMeta(dir, meta);
    fs.writeFileSync(path.join(dir, `${noteSlug}.md`), '', 'utf-8');
    res.status(201).json({ slug: noteSlug, name: name.trim(), file: `${noteSlug}.md`, editable: true, content: '' });
  }));

  // GET prefix/:folderPath/notes/:noteSlug — get note content
  r.get(`${prefix}/:folderPath/notes/:noteSlug`, handle((req, res) => {
    const noteSlug = String(req.params.noteSlug);
    if (!validateFolderSlug(noteSlug)) throw new HttpError(400, 'Invalid slug');
    const baseDir = getBaseDir(req);
    const dir = requireFolderDir(baseDir, pathFromParam(String(req.params.folderPath)));
    const meta = readFolderMeta(dir);
    const entry = meta.notes[noteSlug];
    const file = entry?.file ?? `${noteSlug}.md`;
    const editable = isEditableFile(file);
    const notePath = noteFilePath(dir, meta, noteSlug);
    // Binary files are never read into memory — the client renders a placeholder.
    const content = editable && fs.existsSync(notePath) ? fs.readFileSync(notePath, 'utf-8') : '';
    res.json({ slug: noteSlug, name: entry?.name ?? noteSlug, file, editable, content });
  }));

  // PUT prefix/:folderPath/notes/:noteSlug — save note content
  r.put(`${prefix}/:folderPath/notes/:noteSlug`, handle((req, res) => {
    const noteSlug = String(req.params.noteSlug);
    if (!validateFolderSlug(noteSlug)) throw new HttpError(400, 'Invalid slug');
    const baseDir = getBaseDir(req);
    const dir = requireFolderDir(baseDir, pathFromParam(String(req.params.folderPath)));
    const meta = readFolderMeta(dir);
    const entry = meta.notes[noteSlug];
    const file = entry?.file ?? `${noteSlug}.md`;
    if (!isEditableFile(file)) throw new HttpError(400, 'This file type cannot be edited');
    const { content = '' } = req.body as { content?: string };
    fs.writeFileSync(noteFilePath(dir, meta, noteSlug), content, 'utf-8');
    res.json({ slug: noteSlug, name: entry?.name ?? noteSlug, file, editable: true, content });
  }));

  // PATCH prefix/:folderPath/notes/:noteSlug — rename note
  r.patch(`${prefix}/:folderPath/notes/:noteSlug`, handle((req, res) => {
    const noteSlug = String(req.params.noteSlug);
    if (!validateFolderSlug(noteSlug)) throw new HttpError(400, 'Invalid slug');
    const baseDir = getBaseDir(req);
    const dir = requireFolderDir(baseDir, pathFromParam(String(req.params.folderPath)));
    const { name } = req.body as { name?: string };
    if (!name?.trim()) throw new HttpError(400, 'name is required');
    const meta = readFolderMeta(dir);
    if (!(noteSlug in meta.notes)) throw new HttpError(404, 'Note not found');
    meta.notes[noteSlug].name = name.trim();
    writeFolderMeta(dir, meta);
    res.json({ slug: noteSlug, name: name.trim(), file: meta.notes[noteSlug].file, editable: isEditableFile(meta.notes[noteSlug].file) });
  }));

  // DELETE prefix/:folderPath/notes/:noteSlug — delete note
  r.delete(`${prefix}/:folderPath/notes/:noteSlug`, handle((req, res) => {
    const noteSlug = String(req.params.noteSlug);
    if (!validateFolderSlug(noteSlug)) throw new HttpError(400, 'Invalid slug');
    const baseDir = getBaseDir(req);
    const dir = requireFolderDir(baseDir, pathFromParam(String(req.params.folderPath)));
    const meta = readFolderMeta(dir);
    const notePath = noteFilePath(dir, meta, noteSlug);
    delete meta.notes[noteSlug];
    writeFolderMeta(dir, meta);
    if (fs.existsSync(notePath)) fs.unlinkSync(notePath);
    res.json({ ok: true });
  }));

  // POST prefix/:folderPath/notes/:noteSlug/move — move note
  r.post(`${prefix}/:folderPath/notes/:noteSlug/move`, handle((req, res) => {
    const folderPath = String(req.params.folderPath);
    const noteSlug = String(req.params.noteSlug);
    const { targetFolderSlug } = req.body as { targetFolderSlug?: string };
    if (!validateFolderSlug(noteSlug)) throw new HttpError(400, 'Invalid slug');
    if (!targetFolderSlug) throw new HttpError(400, 'targetFolderSlug is required');
    const baseDir = getBaseDir(req);
    const srcDir = requireFolderDir(baseDir, pathFromParam(folderPath), 'Source folder');
    const tgtDir = requireFolderDir(baseDir, pathFromBody(targetFolderSlug), 'Target folder');
    if (srcDir === tgtDir) throw new HttpError(400, 'Source and target are the same');

    const srcMeta = readFolderMeta(srcDir);
    if (!(noteSlug in srcMeta.notes)) throw new HttpError(404, 'Note not found');
    const { name: noteName, file } = srcMeta.notes[noteSlug];
    const srcPath = path.join(srcDir, file);

    const tgtMeta = readFolderMeta(tgtDir);
    const newSlug = uniqueSlug(noteSlug, (s) => s in tgtMeta.notes);
    // Preserve the original filename unless it would clobber an existing file.
    const takenFiles = new Set(Object.values(tgtMeta.notes).map((n) => n.file));
    const ext = path.extname(file);
    const newFile = takenFiles.has(file) || fs.existsSync(path.join(tgtDir, file)) ? `${newSlug}${ext}` : file;

    if (fs.existsSync(srcPath)) fs.renameSync(srcPath, path.join(tgtDir, newFile));
    tgtMeta.notes[newSlug] = { name: noteName, file: newFile };
    writeFolderMeta(tgtDir, tgtMeta);
    delete srcMeta.notes[noteSlug];
    writeFolderMeta(srcDir, srcMeta);
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
