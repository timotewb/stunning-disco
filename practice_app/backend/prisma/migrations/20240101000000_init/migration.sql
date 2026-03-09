-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "seniority" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Dimension" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'skills',
    "description" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "DimensionNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dimensionId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "DimensionNode_dimensionId_fkey" FOREIGN KEY ("dimensionId") REFERENCES "Dimension" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DimensionNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DimensionNode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL,
    "label" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "MatrixEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamMemberId" TEXT NOT NULL,
    "dimensionNodeId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MatrixEntry_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatrixEntry_dimensionNodeId_fkey" FOREIGN KEY ("dimensionNodeId") REFERENCES "DimensionNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatrixEntry_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Allocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamMemberId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'project',
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Allocation_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SMEAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dimensionNodeId" TEXT NOT NULL,
    "primaryMemberId" TEXT NOT NULL,
    "backupMemberId" TEXT,
    "snapshotId" TEXT NOT NULL,
    CONSTRAINT "SMEAssignment_dimensionNodeId_fkey" FOREIGN KEY ("dimensionNodeId") REFERENCES "DimensionNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SMEAssignment_primaryMemberId_fkey" FOREIGN KEY ("primaryMemberId") REFERENCES "TeamMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SMEAssignment_backupMemberId_fkey" FOREIGN KEY ("backupMemberId") REFERENCES "TeamMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SMEAssignment_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MatrixEntry_teamMemberId_dimensionNodeId_snapshotId_key" ON "MatrixEntry"("teamMemberId", "dimensionNodeId", "snapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "SMEAssignment_dimensionNodeId_snapshotId_key" ON "SMEAssignment"("dimensionNodeId", "snapshotId");
