/**
 * Phase 0 migration: convert existing Allocation rows into WorkRequest rows.
 *
 * Idempotent — safe to run multiple times. Existing WorkRequests that were
 * already migrated from a given Allocation (matched by allocationSourceId) are
 * skipped. The original Allocation rows are left untouched so the legacy
 * /api/allocations routes continue to work during the transition period.
 *
 * Run via: node dist/scripts/migrate-allocations.js
 */
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  const allocations = await prisma.allocation.findMany();

  if (allocations.length === 0) {
    console.log('[migrate-allocations] No allocations found — nothing to migrate.');
    return;
  }

  let migrated = 0;
  let skipped = 0;

  for (const alloc of allocations) {
    // Idempotency check: skip if a WorkRequest already tracks this allocation
    // via the externalRef field (stored as "allocation:<id>").
    const existing = await prisma.workRequest.findFirst({
      where: { externalRef: `allocation:${alloc.id}` },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.workRequest.create({
      data: {
        id: uuidv4(),
        title: alloc.projectName,
        source: 'planning',
        type: 'other',
        status: 'in-flight',
        isDraft: false,
        assigneeId: alloc.teamMemberId,
        isAllocated: true,
        allocationType: alloc.type,
        allocationStartDate: alloc.startDate,
        allocationEndDate: alloc.endDate,
        allocationNotes: alloc.notes ?? '',
        dateRaised: alloc.startDate,
        externalRef: `allocation:${alloc.id}`,
      },
    });

    migrated++;
  }

  console.log(
    `[migrate-allocations] Done — ${migrated} migrated, ${skipped} already existed.`
  );
}

main()
  .catch((e) => {
    console.error('[migrate-allocations] Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
