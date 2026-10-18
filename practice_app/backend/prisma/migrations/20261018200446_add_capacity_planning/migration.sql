-- CreateTable
CREATE TABLE "CapacityChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamMemberId" TEXT NOT NULL,
    "effectiveFrom" DATETIME NOT NULL,
    "effectiveTo" DATETIME,
    "fte" REAL NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CapacityChange_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AllocationTypeConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'gray',
    "reducesCapacity" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_AllocationTypeConfig" ("color", "createdAt", "id", "name") SELECT "color", "createdAt", "id", "name" FROM "AllocationTypeConfig";
DROP TABLE "AllocationTypeConfig";
ALTER TABLE "new_AllocationTypeConfig" RENAME TO "AllocationTypeConfig";
CREATE UNIQUE INDEX "AllocationTypeConfig_name_key" ON "AllocationTypeConfig"("name");
CREATE TABLE "new_TeamMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "seniority" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',
    "isLeaving" BOOLEAN NOT NULL DEFAULT false,
    "hasLeft" BOOLEAN NOT NULL DEFAULT false,
    "baselineFte" REAL NOT NULL DEFAULT 1.0,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_TeamMember" ("createdAt", "hasLeft", "id", "isLeaving", "name", "notes", "role", "seniority", "tags") SELECT "createdAt", "hasLeft", "id", "isLeaving", "name", "notes", "role", "seniority", "tags" FROM "TeamMember";
DROP TABLE "TeamMember";
ALTER TABLE "new_TeamMember" RENAME TO "TeamMember";
CREATE TABLE "new_WorkRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT NOT NULL DEFAULT 'planning',
    "sourceDetail" TEXT,
    "type" TEXT NOT NULL DEFAULT 'other',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'new',
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "effort" TEXT,
    "dateRaised" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateResolved" DATETIME,
    "requestorId" TEXT,
    "assigneeId" TEXT,
    "isAllocated" BOOLEAN NOT NULL DEFAULT false,
    "allocationType" TEXT,
    "allocationStartDate" DATETIME,
    "allocationEndDate" DATETIME,
    "allocationFte" REAL NOT NULL DEFAULT 1.0,
    "allocationNotes" TEXT,
    "noteRef" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "externalRef" TEXT,
    "dimensionNodeIds" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkRequest_requestorId_fkey" FOREIGN KEY ("requestorId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkRequest_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "TeamMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_WorkRequest" ("allocationEndDate", "allocationNotes", "allocationStartDate", "allocationType", "assigneeId", "createdAt", "dateRaised", "dateResolved", "description", "dimensionNodeIds", "effort", "externalRef", "id", "isAllocated", "isDraft", "noteRef", "notes", "priority", "requestorId", "source", "sourceDetail", "status", "tags", "title", "type", "updatedAt") SELECT "allocationEndDate", "allocationNotes", "allocationStartDate", "allocationType", "assigneeId", "createdAt", "dateRaised", "dateResolved", "description", "dimensionNodeIds", "effort", "externalRef", "id", "isAllocated", "isDraft", "noteRef", "notes", "priority", "requestorId", "source", "sourceDetail", "status", "tags", "title", "type", "updatedAt" FROM "WorkRequest";
DROP TABLE "WorkRequest";
ALTER TABLE "new_WorkRequest" RENAME TO "WorkRequest";
CREATE INDEX "WorkRequest_isAllocated_allocationStartDate_allocationEndDate_idx" ON "WorkRequest"("isAllocated", "allocationStartDate", "allocationEndDate");
CREATE INDEX "WorkRequest_assigneeId_isAllocated_idx" ON "WorkRequest"("assigneeId", "isAllocated");
CREATE INDEX "WorkRequest_requestorId_idx" ON "WorkRequest"("requestorId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CapacityChange_teamMemberId_effectiveFrom_idx" ON "CapacityChange"("teamMemberId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "CapacityChange_teamMemberId_effectiveFrom_key" ON "CapacityChange"("teamMemberId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

-- Backfill: existing installs already have allocation types seeded, so the lazy
-- seeder will never run again. Mark the built-in `leave` type as capacity-reducing
-- once here. Done in the migration rather than the seeder so it cannot later
-- override a deliberate user change.
UPDATE "AllocationTypeConfig" SET "reducesCapacity" = true WHERE "name" = 'leave';
