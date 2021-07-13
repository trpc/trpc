/*
  Warnings:

  - A unique constraint covering the columns `[createdAt]` on the table `Post` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[updatedAt]` on the table `Post` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "Post.createdAt_unique" ON "Post"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Post.updatedAt_unique" ON "Post"("updatedAt");
