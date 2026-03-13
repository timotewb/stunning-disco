-- CreateTable
CREATE TABLE "WorkRequest" (
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
    CONSTRAINT "WorkRequest_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "TeamMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "WorkRequest_isAllocated_allocationStartDate_allocationEndDate_idx" ON "WorkRequest"("isAllocated", "allocationStartDate", "allocationEndDate");

-- CreateIndex
CREATE INDEX "WorkRequest_assigneeId_isAllocated_idx" ON "WorkRequest"("assigneeId", "isAllocated");
