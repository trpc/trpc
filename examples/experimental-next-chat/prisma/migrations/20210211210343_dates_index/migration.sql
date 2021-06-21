/*
  Warnings:

  - The migration will add a unique constraint covering the columns `[createdAt]` on the table `Message`. If there are existing duplicate values, the migration will fail.
  - The migration will add a unique constraint covering the columns `[updatedAt]` on the table `Message`. If there are existing duplicate values, the migration will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Message.createdAt_unique" ON "Message"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message.updatedAt_unique" ON "Message"("updatedAt");
