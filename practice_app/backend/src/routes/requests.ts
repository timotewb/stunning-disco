import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { getConfigPath, resolveOllamaUrl, readConfig, ollamaPost, readPrompts } from './ai';

const router = Router();
const prisma = new PrismaClient();

// ── Scanner config ────────────────────────────────────────────────────────────

interface ScannerConfig {
  lookbackDays: number;
  autoScan: boolean;
  includeDailyNotes: boolean;
  includeFolders: string[];
}

const defaultScannerConfig: ScannerConfig = {
  lookbackDays: 7,
  autoScan: false,
  includeDailyNotes: true,
  includeFolders: [],
};

function getScannerConfigPath(): string {
  const cfgPath = getConfigPath();
  return path.join(path.dirname(cfgPath), 'scanner-config.json');
}

function readScannerConfig(): ScannerConfig {
  const p = getScannerConfigPath();
  if (fs.existsSync(p)) {
    try { return { ...defaultScannerConfig, ...JSON.parse(fs.readFileSync(p, 'utf-8')) }; } catch { /* fall through */ }
  }
  return { ...defaultScannerConfig };
}

function writeScannerConfig(cfg: ScannerConfig): void {
  const p = getScannerConfigPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
}

function getNotesDir(): string {
  const dbUrl = process.env.DATABASE_URL ?? 'file:/app/data/practice.db';
  const dbPath = dbUrl.replace(/^file:/, '');
  const absoluteDbPath = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
  return path.join(path.dirname(absoluteDbPath), 'notes');
}

// ── Scanner config endpoints ──────────────────────────────────────────────────

router.get('/scanner-config', (_req, res) => {
  res.json(readScannerConfig());
});

router.put('/scanner-config', (req, res) => {
  const cfg = { ...readScannerConfig(), ...req.body };
  writeScannerConfig(cfg);
  res.json(cfg);
});

// ── Paste & Parse ─────────────────────────────────────────────────────────────

router.post('/parse', async (req: Request, res: Response) => {
  const { content, model = 'llama3.2:3b' } = req.body as { content: string; model?: string };
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });
  const url = resolveOllamaUrl(readConfig());
  const prompts = readPrompts();
  const systemPrompt = (prompts as unknown as Record<string, string>).requestParse ?? '';
  try {
    const result = await ollamaPost(url, '/api/generate', {
      model,
      system: systemPrompt,
      prompt: content,
      stream: false,
    }) as { response: string };
    const text = result.response.trim();
    let suggestion: Record<string, string> = {};
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) suggestion = JSON.parse(jsonMatch[0]);
    } catch { /* ignore parse errors */ }
    res.json({ suggestion });
  } catch (err) {
    res.status(502).json({ error: 'Ollama request failed: ' + String(err) });
  }
});

// ── AI Notes Scanner ──────────────────────────────────────────────────────────

router.post('/scan-notes', async (req: Request, res: Response) => {
  const { model = 'llama3.2:3b' } = req.body as { model?: string };
  const cfg = readScannerConfig();
  const notesDir = getNotesDir();
  const url = resolveOllamaUrl(readConfig());
  const prompts = readPrompts();
  const systemPrompt = (prompts as unknown as Record<string, string>).requestExtract ?? '';

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - cfg.lookbackDays);

  const noteFiles: { noteRef: string; content: string }[] = [];

  if (cfg.includeDailyNotes && fs.existsSync(notesDir)) {
    const monthDirs = fs.readdirSync(notesDir)
      .filter((d) => /^\d{6}$/.test(d)).sort().reverse();
    for (const monthDir of monthDirs) {
      const monthPath = path.join(notesDir, monthDir);
      if (!fs.statSync(monthPath).isDirectory()) continue;
      const files = fs.readdirSync(monthPath)
        .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().reverse();
      for (const file of files) {
        const date = file.replace('.md', '');
        if (new Date(date) < cutoff) continue;
        const noteRef = `daily-notes/${date}`;
        const content = fs.readFileSync(path.join(monthPath, file), 'utf-8').trim();
        if (content) noteFiles.push({ noteRef, content });
      }
    }
  }

  for (const folderSlug of cfg.includeFolders) {
    const folderDir = path.join(notesDir, 'folders', folderSlug);
    if (!fs.existsSync(folderDir)) continue;
    const metaPath = path.join(folderDir, '_meta.json');
    let noteNames: string[] = [];
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        noteNames = Object.keys(meta.notes ?? {});
      } catch { /* skip */ }
    }
    for (const slug of noteNames) {
      const notePath = path.join(folderDir, `${slug}.md`);
      if (!fs.existsSync(notePath)) continue;
      const content = fs.readFileSync(notePath, 'utf-8').trim();
      if (content) noteFiles.push({ noteRef: `folders/${folderSlug}/${slug}`, content });
    }
  }

  let draftsCreated = 0;
  let skippedAlreadyScanned = 0;

  for (const { noteRef, content } of noteFiles) {
    const existing = await prisma.workRequest.findFirst({ where: { noteRef } });
    if (existing) { skippedAlreadyScanned++; continue; }

    let candidates: Array<{ title?: string; excerpt?: string; suggestedSource?: string; suggestedType?: string; suggestedPriority?: string }> = [];
    try {
      const result = await ollamaPost(url, '/api/generate', {
        model,
        system: systemPrompt,
        prompt: content,
        stream: false,
      }) as { response: string };
      const text = result.response.trim();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) candidates = JSON.parse(jsonMatch[0]);
    } catch { /* skip this note on error */ }

    for (const c of candidates) {
      if (!c.title?.trim()) continue;
      await prisma.workRequest.create({
        data: {
          id: uuidv4(),
          title: c.title.trim().slice(0, 200),
          description: c.excerpt?.trim() ?? undefined,
          source: c.suggestedSource ?? 'other',
          type: c.suggestedType ?? 'other',
          priority: c.suggestedPriority ?? 'medium',
          status: 'draft',
          isDraft: true,
          noteRef,
          dateRaised: new Date(),
        },
      });
      draftsCreated++;
    }
  }

  res.json({ draftsCreated, skippedAlreadyScanned, notesScanned: noteFiles.length });
});

// ── Scan a single note on demand ──────────────────────────────────────────────

router.post('/scan-note', async (req: Request, res: Response) => {
  const { noteRef, content, model = 'llama3.2:3b' } = req.body as { noteRef: string; content: string; model?: string };
  if (!noteRef?.trim()) return res.status(400).json({ error: 'noteRef required' });
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });

  // Check if this note has already been scanned
  const existing = await prisma.workRequest.findFirst({ where: { noteRef } });
  if (existing) {
    return res.json({ draftsCreated: 0, alreadyScanned: true });
  }

  const url = resolveOllamaUrl(readConfig());
  const prompts = readPrompts();
  const systemPrompt = (prompts as unknown as Record<string, string>).requestExtract ?? '';

  let candidates: Array<{ title?: string; excerpt?: string; suggestedSource?: string; suggestedType?: string; suggestedPriority?: string }> = [];
  try {
    const result = await ollamaPost(url, '/api/generate', {
      model,
      system: systemPrompt,
      prompt: content,
      stream: false,
    }) as { response: string };
    const text = result.response.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) candidates = JSON.parse(jsonMatch[0]);
  } catch (err) {
    return res.status(502).json({ error: 'Ollama request failed: ' + String(err) });
  }

  let draftsCreated = 0;
  for (const c of candidates) {
    if (!c.title?.trim()) continue;
    await prisma.workRequest.create({
      data: {
        id: uuidv4(),
        title: c.title.trim().slice(0, 200),
        description: c.excerpt?.trim() ?? undefined,
        source: c.suggestedSource ?? 'other',
        type: c.suggestedType ?? 'other',
        priority: c.suggestedPriority ?? 'medium',
        status: 'draft',
        isDraft: true,
        noteRef,
        dateRaised: new Date(),
      },
    });
    draftsCreated++;
  }

  res.json({ draftsCreated, alreadyScanned: false });
});

// ─────────────────────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      isAllocated,
      isDraft,
      source,
      type,
      priority,
      status,
      assigneeId,
      from,
      to,
      raisedFrom,
      raisedTo,
      q,
    } = req.query;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {};

    if (isAllocated !== undefined) where.isAllocated = isAllocated === 'true';
    if (isDraft !== undefined) where.isDraft = isDraft === 'true';
    if (source) where.source = { in: String(source).split(',') };
    if (type) where.type = { in: String(type).split(',') };
    if (priority) where.priority = { in: String(priority).split(',') };
    if (status) where.status = { in: String(status).split(',') };
    if (assigneeId) where.assigneeId = { in: String(assigneeId).split(',') };

    // Timeline range filter (allocation dates)
    if (from || to) {
      if (from) where.allocationEndDate = { gte: new Date(String(from)) };
      if (to) where.allocationStartDate = { lte: new Date(String(to)) };
    }

    // Date raised range filter
    if (raisedFrom || raisedTo) {
      where.dateRaised = {};
      if (raisedFrom) where.dateRaised.gte = new Date(String(raisedFrom));
      if (raisedTo) where.dateRaised.lte = new Date(String(raisedTo));
    }

    // Free-text search across title, description, externalRef, tags
    if (q) {
      const search = String(q);
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
        { externalRef: { contains: search } },
        { tags: { contains: search } },
        { requestor: { name: { contains: search } } },
        { requestor: { team: { contains: search } } },
      ];
    }

    const orderBy = isAllocated === 'true'
      ? { allocationStartDate: 'asc' as const }
      : { dateRaised: 'desc' as const };

    const requests = await prisma.workRequest.findMany({
      where,
      include: { assignee: true, requestor: true },
      orderBy,
    });

    // Deserialise JSON string fields
    const result = requests.map((r) => ({
      ...r,
      tags: (() => { try { return JSON.parse(r.tags); } catch { return []; } })(),
      dimensionNodeIds: (() => { try { return JSON.parse(r.dimensionNodeIds); } catch { return []; } })(),
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Analytics ────────────────────────────────────────────────────────────────
// Must be declared BEFORE /:id routes so Express doesn't confuse "analytics"
// with a literal ID.

router.get('/analytics', async (req: Request, res: Response) => {
  try {
    const { from, to, groupBy = 'month' } = req.query;

    const where: Record<string, unknown> = {};
    if (from || to) {
      where.dateRaised = {};
      if (from) (where.dateRaised as Record<string, unknown>).gte = new Date(String(from));
      if (to)   (where.dateRaised as Record<string, unknown>).lte = new Date(String(to));
    }

    const all = await prisma.workRequest.findMany({
      where,
      include: { assignee: true },
      orderBy: { dateRaised: 'asc' },
    });

    // ── 1. Volume Over Time ──────────────────────────────────────────────────
    const periodKey = (d: Date): string => {
      const y = d.getFullYear();
      if (groupBy === 'week') {
        // ISO week number
        const start = new Date(d);
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - start.getDay() + 1); // Monday
        const mm = String(start.getMonth() + 1).padStart(2, '0');
        const dd = String(start.getDate()).padStart(2, '0');
        return `${y}-${mm}-${dd}`;
      }
      // month
      return `${y}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    const volMap: Record<string, { total: number; bySource: Record<string, number>; byType: Record<string, number>; byPriority: Record<string, number> }> = {};
    for (const r of all) {
      const key = periodKey(new Date(r.dateRaised));
      if (!volMap[key]) volMap[key] = { total: 0, bySource: {}, byType: {}, byPriority: {} };
      volMap[key].total++;
      volMap[key].bySource[r.source] = (volMap[key].bySource[r.source] ?? 0) + 1;
      volMap[key].byType[r.type] = (volMap[key].byType[r.type] ?? 0) + 1;
      volMap[key].byPriority[r.priority] = (volMap[key].byPriority[r.priority] ?? 0) + 1;
    }
    const volumeOverTime = Object.entries(volMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, data]) => ({ period, ...data }));

    // ── 2. By Source ─────────────────────────────────────────────────────────
    const srcMap: Record<string, number> = {};
    for (const r of all) srcMap[r.source] = (srcMap[r.source] ?? 0) + 1;
    const bySource = Object.entries(srcMap).map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);

    // ── 3. By Type ───────────────────────────────────────────────────────────
    const typeMap: Record<string, number> = {};
    for (const r of all) typeMap[r.type] = (typeMap[r.type] ?? 0) + 1;
    const byType = Object.entries(typeMap).map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    // ── 4. By Status ─────────────────────────────────────────────────────────
    const statusMap: Record<string, number> = {};
    for (const r of all) statusMap[r.status] = (statusMap[r.status] ?? 0) + 1;
    const byStatus = Object.entries(statusMap).map(([status, count]) => ({ status, count }));

    // ── 5. Assignee Load ─────────────────────────────────────────────────────
    const inFlight = all.filter((r) => r.status === 'in-flight' && r.assigneeId);
    const loadMap: Record<string, {
      assigneeId: string; name: string;
      scheduledCount: number; unscheduledCount: number; inFlightCount: number;
      byPriority: Record<string, number>;
      requests: { id: string; title: string; priority: string; isAllocated: boolean }[];
    }> = {};
    for (const r of inFlight) {
      const aid = r.assigneeId!;
      if (!loadMap[aid]) {
        loadMap[aid] = {
          assigneeId: aid,
          name: r.assignee?.name ?? aid,
          scheduledCount: 0,
          unscheduledCount: 0,
          inFlightCount: 0,
          byPriority: {},
          requests: [],
        };
      }
      loadMap[aid].inFlightCount++;
      loadMap[aid].byPriority[r.priority] = (loadMap[aid].byPriority[r.priority] ?? 0) + 1;
      loadMap[aid].requests.push({ id: r.id, title: r.title, priority: r.priority, isAllocated: r.isAllocated });
      if (r.isAllocated) loadMap[aid].scheduledCount++;
      else loadMap[aid].unscheduledCount++;
    }
    const assigneeLoad = Object.values(loadMap).sort((a, b) => b.inFlightCount - a.inFlightCount);

    // ── 6. Skills Pressure ───────────────────────────────────────────────────
    const openRequests = all.filter((r) => !['resolved', 'deferred', 'rejected', 'done', 'closed'].includes(r.status));
    const nodeCountMap: Record<string, number> = {};
    for (const r of openRequests) {
      let nodeIds: string[] = [];
      try { nodeIds = JSON.parse(r.dimensionNodeIds ?? '[]'); } catch { /* skip */ }
      for (const nid of nodeIds) {
        nodeCountMap[nid] = (nodeCountMap[nid] ?? 0) + 1;
      }
    }
    const nodeIds = Object.keys(nodeCountMap);
    const nodes = nodeIds.length > 0
      ? await prisma.dimensionNode.findMany({ where: { id: { in: nodeIds } } })
      : [];
    const skillsPressure = nodes.map((n) => ({
      dimensionNodeId: n.id,
      name: n.name,
      openCount: nodeCountMap[n.id] ?? 0,
    })).sort((a, b) => b.openCount - a.openCount);

    // ── 7. Median Dwell Days ─────────────────────────────────────────────────
    const now = new Date();
    const dwellByStatus: Record<string, number[]> = {};
    for (const r of all) {
      const end = r.dateResolved ? new Date(r.dateResolved) : (r.status === 'in-flight' ? now : null);
      if (!end) continue;
      const days = Math.max(0, Math.floor((end.getTime() - new Date(r.dateRaised).getTime()) / 86400000));
      if (!dwellByStatus[r.status]) dwellByStatus[r.status] = [];
      dwellByStatus[r.status].push(days);
    }
    const medianDwellDays: Record<string, number> = {};
    for (const [status, vals] of Object.entries(dwellByStatus)) {
      const sorted = vals.slice().sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      medianDwellDays[status] = sorted.length % 2 === 0
        ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
        : sorted[mid];
    }

    res.json({ volumeOverTime, bySource, byType, byStatus, assigneeLoad, skillsPressure, medianDwellDays });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      source = 'planning',
      sourceDetail,
      type = 'other',
      priority = 'medium',
      status = 'new',
      isDraft = false,
      effort,
      dateRaised,
      dateResolved,
      requestorId,
      assigneeId,
      isAllocated = false,
      allocationType,
      allocationStartDate,
      allocationEndDate,
      allocationNotes,
      noteRef,
      tags = '[]',
      externalRef,
      dimensionNodeIds = '[]',
      notes,
    } = req.body;

    // Auto-advance status to in-flight when allocating
    let resolvedStatus = status;
    if (isAllocated && (status === 'new' || status === 'assessed')) {
      resolvedStatus = 'in-flight';
    }

    const request = await prisma.workRequest.create({
      data: {
        id: uuidv4(),
        title,
        description,
        source,
        sourceDetail,
        type,
        priority,
        status: resolvedStatus,
        isDraft,
        effort,
        dateRaised: dateRaised ? new Date(dateRaised) : new Date(),
        dateResolved: dateResolved ? new Date(dateResolved) : undefined,
        requestorId: requestorId || undefined,
        assigneeId: assigneeId || undefined,
        isAllocated,
        allocationType,
        allocationStartDate: allocationStartDate ? new Date(allocationStartDate) : undefined,
        allocationEndDate: allocationEndDate ? new Date(allocationEndDate) : undefined,
        allocationNotes,
        noteRef,
        tags: Array.isArray(tags) ? JSON.stringify(tags) : tags,
        externalRef,
        dimensionNodeIds: Array.isArray(dimensionNodeIds)
          ? JSON.stringify(dimensionNodeIds)
          : dimensionNodeIds,
        notes,
      },
      include: { assignee: true, requestor: true },
    });

    res.status(201).json({
      ...request,
      tags: (() => { try { return JSON.parse(request.tags); } catch { return []; } })(),
      dimensionNodeIds: (() => { try { return JSON.parse(request.dimensionNodeIds); } catch { return []; } })(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const {
      title,
      description,
      source,
      sourceDetail,
      type,
      priority,
      status,
      isDraft,
      effort,
      dateRaised,
      dateResolved,
      requestorId,
      assigneeId,
      isAllocated,
      allocationType,
      allocationStartDate,
      allocationEndDate,
      allocationNotes,
      noteRef,
      tags,
      externalRef,
      dimensionNodeIds,
      notes,
    } = req.body;

    // Auto-advance status when allocating
    let resolvedStatus = status;
    if (isAllocated === true && (status === 'new' || status === 'assessed')) {
      resolvedStatus = 'in-flight';
    } else if (isAllocated === true && status === undefined) {
      // Check current status and auto-advance if needed
      const current = await prisma.workRequest.findUnique({ where: { id }, select: { status: true } });
      if (current && (current.status === 'new' || current.status === 'assessed')) {
        resolvedStatus = 'in-flight';
      }
    }

    const request = await prisma.workRequest.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(source !== undefined && { source }),
        ...(sourceDetail !== undefined && { sourceDetail }),
        ...(type !== undefined && { type }),
        ...(priority !== undefined && { priority }),
        ...((resolvedStatus !== undefined) && { status: resolvedStatus }),
        ...(isDraft !== undefined && { isDraft }),
        ...(effort !== undefined && { effort }),
        ...(dateRaised !== undefined && { dateRaised: new Date(dateRaised) }),
        ...(dateResolved !== undefined && {
          dateResolved: dateResolved ? new Date(dateResolved) : null,
        }),
        ...(requestorId !== undefined && { requestorId: requestorId || null }),
        ...(assigneeId !== undefined && { assigneeId: assigneeId || null }),
        ...(isAllocated !== undefined && { isAllocated }),
        ...(allocationType !== undefined && { allocationType }),
        ...(allocationStartDate !== undefined && {
          allocationStartDate: allocationStartDate ? new Date(allocationStartDate) : null,
        }),
        ...(allocationEndDate !== undefined && {
          allocationEndDate: allocationEndDate ? new Date(allocationEndDate) : null,
        }),
        ...(allocationNotes !== undefined && { allocationNotes }),
        ...(noteRef !== undefined && { noteRef }),
        ...(tags !== undefined && {
          tags: Array.isArray(tags) ? JSON.stringify(tags) : tags,
        }),
        ...(externalRef !== undefined && { externalRef }),
        ...(dimensionNodeIds !== undefined && {
          dimensionNodeIds: Array.isArray(dimensionNodeIds)
            ? JSON.stringify(dimensionNodeIds)
            : dimensionNodeIds,
        }),
        ...(notes !== undefined && { notes }),
      },
      include: { assignee: true, requestor: true },
    });

    res.json({
      ...request,
      tags: (() => { try { return JSON.parse(request.tags); } catch { return []; } })(),
      dimensionNodeIds: (() => { try { return JSON.parse(request.dimensionNodeIds); } catch { return []; } })(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.workRequest.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;

