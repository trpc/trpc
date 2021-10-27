-- CreateEnum
CREATE TYPE "PosterSource" AS ENUM ('RAW', 'GITHUB');

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source" "PosterSource" NOT NULL DEFAULT E'RAW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Post_createdAt_key" ON "Post"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Post_updatedAt_key" ON "Post"("updatedAt");
