-- CreateEnum
CREATE TYPE "PosterSource" AS ENUM ('RAW', 'GITHUB');

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "source" "PosterSource" NOT NULL DEFAULT E'RAW';
