/*
  Warnings:

  - You are about to drop the column `label` on the `Snapshot` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Snapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL
);
INSERT INTO "new_Snapshot" ("id", "timestamp") SELECT "id", "timestamp" FROM "Snapshot";
DROP TABLE "Snapshot";
ALTER TABLE "new_Snapshot" RENAME TO "Snapshot";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
