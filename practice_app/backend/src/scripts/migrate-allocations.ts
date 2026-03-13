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

const prisma = new PrismaClient();

async function main() {
  // Allocation model has been removed; migration is a no-op.
  console.log('[migrate-allocations] Allocation model removed — skipping migration.');
}

main()
  .catch((e) => {
    console.error('[migrate-allocations] Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
