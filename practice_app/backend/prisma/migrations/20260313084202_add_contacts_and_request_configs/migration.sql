-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "team" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RequestSourceConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'gray',
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RequestTypeConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'gray',
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RequestPriorityConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'gray',
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RequestStatusConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'gray',
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RequestEffortConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
INSERT INTO "new_WorkRequest" ("allocationEndDate", "allocationNotes", "allocationStartDate", "allocationType", "assigneeId", "createdAt", "dateRaised", "dateResolved", "description", "dimensionNodeIds", "effort", "externalRef", "id", "isAllocated", "isDraft", "noteRef", "notes", "priority", "source", "sourceDetail", "status", "tags", "title", "type", "updatedAt") SELECT "allocationEndDate", "allocationNotes", "allocationStartDate", "allocationType", "assigneeId", "createdAt", "dateRaised", "dateResolved", "description", "dimensionNodeIds", "effort", "externalRef", "id", "isAllocated", "isDraft", "noteRef", "notes", "priority", "source", "sourceDetail", "status", "tags", "title", "type", "updatedAt" FROM "WorkRequest";
DROP TABLE "WorkRequest";
ALTER TABLE "new_WorkRequest" RENAME TO "WorkRequest";
CREATE INDEX "WorkRequest_isAllocated_allocationStartDate_allocationEndDate_idx" ON "WorkRequest"("isAllocated", "allocationStartDate", "allocationEndDate");
CREATE INDEX "WorkRequest_assigneeId_isAllocated_idx" ON "WorkRequest"("assigneeId", "isAllocated");
CREATE INDEX "WorkRequest_requestorId_idx" ON "WorkRequest"("requestorId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "RequestSourceConfig_name_key" ON "RequestSourceConfig"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RequestTypeConfig_name_key" ON "RequestTypeConfig"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RequestPriorityConfig_name_key" ON "RequestPriorityConfig"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RequestStatusConfig_name_key" ON "RequestStatusConfig"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RequestEffortConfig_name_key" ON "RequestEffortConfig"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RequestEffortConfig_value_key" ON "RequestEffortConfig"("value");
