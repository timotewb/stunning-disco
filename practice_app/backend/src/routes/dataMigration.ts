import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const router = Router();
const prisma = new PrismaClient();

// ── Notes helpers ─────────────────────────────────────────────────────────────

function getNotesDir(): string {
  const dbUrl = process.env.DATABASE_URL ?? 'file:/app/data/practice.db';
  const dbPath = dbUrl.replace(/^file:/, '');
  const absoluteDbPath = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
  return path.join(path.dirname(absoluteDbPath), 'notes');
}

/** Walk a directory recursively, returning all files with paths relative to root. */
function walkNotes(dir: string, root: string): { path: string; content: string }[] {
  if (!fs.existsSync(dir)) return [];
  const results: { path: string; content: string }[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkNotes(full, root));
    } else if (entry.name.endsWith('.md') || entry.name === '_meta.json') {
      results.push({
        path: path.relative(root, full).replace(/\\/g, '/'), // normalise Windows separators
        content: fs.readFileSync(full, 'utf-8'),
      });
    }
  }
  return results;
}

/** Write note files back to disk, creating parent directories as needed. */
function restoreNotes(notes: { path: string; content: string }[], notesDir: string): void {
  for (const note of notes) {
    // Prevent path traversal
    const resolved = path.resolve(notesDir, note.path);
    if (!resolved.startsWith(notesDir)) continue;
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, note.content, 'utf-8');
  }
}

router.get('/export', async (_req, res) => {
  try {
    const [
      teamMembers,
      dimensions,
      snapshots,
      matrixEntries,
      smeAssignments,
      workRequests,
      contacts,
      allocationTypes,
      seniorityConfigs,
      requestSourceConfigs,
      requestTypeConfigs,
      requestPriorityConfigs,
      requestStatusConfigs,
      requestEffortConfigs,
    ] = await Promise.all([
      prisma.teamMember.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.dimension.findMany({
        include: { nodes: { orderBy: { orderIndex: 'asc' } } },
        orderBy: { name: 'asc' },
      }),
      prisma.snapshot.findMany({ orderBy: { timestamp: 'asc' } }),
      prisma.matrixEntry.findMany(),
      prisma.sMEAssignment.findMany(),
      prisma.workRequest.findMany({ orderBy: { dateRaised: 'asc' } }),
      prisma.contact.findMany({ orderBy: { name: 'asc' } }),
      prisma.allocationTypeConfig.findMany(),
      prisma.seniorityConfig.findMany(),
      prisma.requestSourceConfig.findMany(),
      prisma.requestTypeConfig.findMany(),
      prisma.requestPriorityConfig.findMany(),
      prisma.requestStatusConfig.findMany(),
      prisma.requestEffortConfig.findMany(),
    ]);

    // Flatten dimension nodes (exported separately to simplify import ordering)
    const dimensionNodes = dimensions.flatMap((d) =>
      (d.nodes as { id: string; name: string; parentId: string | null; dimensionId: string; orderIndex: number; createdAt: Date }[]).map((n) => ({
        id: n.id,
        name: n.name,
        parentId: n.parentId,
        dimensionId: n.dimensionId,
        orderIndex: n.orderIndex,
        createdAt: n.createdAt,
      }))
    );
    const dimensionsFlat = dimensions.map(({ nodes: _nodes, ...d }) => d);

    // Collect notes from the filesystem
    const notesDir = getNotesDir();
    const notes = walkNotes(notesDir, notesDir);

    const payload = {
      version: '1.0',
      app: 'kaimahi',
      exportedAt: new Date().toISOString(),
      counts: {
        teamMembers: teamMembers.length,
        dimensions: dimensionsFlat.length,
        dimensionNodes: dimensionNodes.length,
        snapshots: snapshots.length,
        matrixEntries: matrixEntries.length,
        smeAssignments: smeAssignments.length,
        workRequests: workRequests.length,
        contacts: contacts.length,
        notes: notes.length,
        allocationTypes: allocationTypes.length,
        seniorityConfigs: seniorityConfigs.length,
        requestSourceConfigs: requestSourceConfigs.length,
        requestTypeConfigs: requestTypeConfigs.length,
        requestPriorityConfigs: requestPriorityConfigs.length,
        requestStatusConfigs: requestStatusConfigs.length,
        requestEffortConfigs: requestEffortConfigs.length,
      },
      data: {
        teamMembers,
        dimensions: dimensionsFlat,
        dimensionNodes,
        snapshots,
        matrixEntries,
        smeAssignments,
        workRequests,
        contacts,
        allocationTypes,
        seniorityConfigs,
        requestSourceConfigs,
        requestTypeConfigs,
        requestPriorityConfigs,
        requestStatusConfigs,
        requestEffortConfigs,
        notes,
      },
    };

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="kaimahi-export-${date}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Import ────────────────────────────────────────────────────────────────────
// Validates the import payload then REPLACES all existing data in a single
// transaction. Any failure rolls back and leaves the database unchanged.

router.post('/import', async (req, res) => {
  const { version, app, data } = req.body;

  if (!version || app !== 'kaimahi' || !data) {
    return res.status(400).json({ error: 'Invalid export file — this file was not created by kaimahi.' });
  }

  try {
    await prisma.$transaction(      async (tx) => {
        // ── 1. Clear all existing data ─────────────────────────────────────
        // Disable FK constraints so we can delete in any order.
        await tx.$executeRawUnsafe('PRAGMA foreign_keys = OFF');

        await tx.matrixEntry.deleteMany();
        await tx.sMEAssignment.deleteMany();
        await tx.workRequest.deleteMany();
        await tx.dimensionNode.deleteMany();
        await tx.dimension.deleteMany();
        await tx.teamMember.deleteMany();
        await tx.snapshot.deleteMany();
        await tx.contact.deleteMany();
        await tx.allocationTypeConfig.deleteMany();
        await tx.seniorityConfig.deleteMany();
        await tx.requestSourceConfig.deleteMany();
        await tx.requestTypeConfig.deleteMany();
        await tx.requestPriorityConfig.deleteMany();
        await tx.requestStatusConfig.deleteMany();
        await tx.requestEffortConfig.deleteMany();

        await tx.$executeRawUnsafe('PRAGMA foreign_keys = ON');

        // ── 2. Re-insert in FK dependency order ────────────────────────────

        // Independent lookup tables first
        if (data.contacts?.length)
          await tx.contact.createMany({ data: data.contacts });
        if (data.teamMembers?.length)
          await tx.teamMember.createMany({ data: data.teamMembers });
        if (data.dimensions?.length)
          await tx.dimension.createMany({ data: data.dimensions });
        if (data.snapshots?.length)
          await tx.snapshot.createMany({ data: data.snapshots });

        // DimensionNodes: topological insert (parents before children)
        if (data.dimensionNodes?.length) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const allNodes: any[] = data.dimensionNodes;
          const inserted = new Set<string>();

          let remaining = [...allNodes];
          let maxIter = allNodes.length + 2;
          while (remaining.length > 0 && maxIter-- > 0) {
            const batch = remaining.filter(
              (n) => !n.parentId || inserted.has(n.parentId)
            );
            if (batch.length === 0) break;
            await tx.dimensionNode.createMany({ data: batch });
            batch.forEach((n) => inserted.add(n.id));
            remaining = remaining.filter((n) => !inserted.has(n.id));
          }
        }

        // Dependent tables
        if (data.matrixEntries?.length)
          await tx.matrixEntry.createMany({ data: data.matrixEntries });
        if (data.smeAssignments?.length)
          await tx.sMEAssignment.createMany({ data: data.smeAssignments });
        if (data.workRequests?.length)
          await tx.workRequest.createMany({ data: data.workRequests });

        // Config tables
        if (data.allocationTypes?.length)
          await tx.allocationTypeConfig.createMany({ data: data.allocationTypes });
        if (data.seniorityConfigs?.length)
          await tx.seniorityConfig.createMany({ data: data.seniorityConfigs });
        if (data.requestSourceConfigs?.length)
          await tx.requestSourceConfig.createMany({ data: data.requestSourceConfigs });
        if (data.requestTypeConfigs?.length)
          await tx.requestTypeConfig.createMany({ data: data.requestTypeConfigs });
        if (data.requestPriorityConfigs?.length)
          await tx.requestPriorityConfig.createMany({ data: data.requestPriorityConfigs });
        if (data.requestStatusConfigs?.length)
          await tx.requestStatusConfig.createMany({ data: data.requestStatusConfigs });
        if (data.requestEffortConfigs?.length)
          await tx.requestEffortConfig.createMany({ data: data.requestEffortConfigs });
      },
      { timeout: 30_000 }
    );

    // Restore notes after the DB transaction commits (filesystem writes can't be rolled back,
    // but the DB is the source of truth — losing notes on a failed import is unlikely and
    // acceptable given the transaction already succeeded).
    if (Array.isArray(data.notes) && data.notes.length > 0) {
      const notesDir = getNotesDir();
      restoreNotes(data.notes, notesDir);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
