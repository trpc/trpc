/*
  Warnings:

  - A unique constraint covering the columns `[createdAt]` on the table `Post` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Post_createdAt_key" ON "Post"("createdAt");
