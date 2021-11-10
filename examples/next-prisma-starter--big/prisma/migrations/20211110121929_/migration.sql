-- CreateTable
CREATE TABLE "Animal" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Animal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Backpack" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Backpack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bag" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Book" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bookcase" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bookcase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bottle" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bottle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Calendar" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Calendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cat" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Content" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dog" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flight" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Flight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Horse" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Horse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "List" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "List_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Movie" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Movie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seat" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Seat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shoe" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shoe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sweater" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sweater_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Thing" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Thing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trial" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random0" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random0_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random1" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random1_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random2" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random3" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random3_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random4" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random4_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random5" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random5_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random6" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random6_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random7" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random7_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random8" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random8_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random9" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random9_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random10" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random10_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random11" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random11_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random12" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random12_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random13" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random13_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random14" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random14_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random15" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random15_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random16" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random16_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random17" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random17_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random18" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random18_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random19" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random19_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random20" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random20_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random21" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random21_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random22" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random22_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random23" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random23_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random24" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random24_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random25" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random25_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random26" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random26_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random27" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random27_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random28" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random28_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random29" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random29_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random30" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random30_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random31" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random31_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random32" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random32_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random33" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random33_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random34" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random34_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random35" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random35_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random36" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random36_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random37" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random37_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random38" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random38_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random39" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random39_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random40" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random40_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random41" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random41_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random42" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random42_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random43" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random43_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random44" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random44_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random45" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random45_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random46" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random46_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random47" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random47_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random48" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random48_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random49" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random49_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Random50" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Random50_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Animal_createdAt_key" ON "Animal"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Animal_updatedAt_key" ON "Animal"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Backpack_createdAt_key" ON "Backpack"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Backpack_updatedAt_key" ON "Backpack"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Bag_createdAt_key" ON "Bag"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Bag_updatedAt_key" ON "Bag"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Book_createdAt_key" ON "Book"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Book_updatedAt_key" ON "Book"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Bookcase_createdAt_key" ON "Bookcase"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Bookcase_updatedAt_key" ON "Bookcase"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Bottle_createdAt_key" ON "Bottle"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Bottle_updatedAt_key" ON "Bottle"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Calendar_createdAt_key" ON "Calendar"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Calendar_updatedAt_key" ON "Calendar"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Cat_createdAt_key" ON "Cat"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Cat_updatedAt_key" ON "Cat"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Content_createdAt_key" ON "Content"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Content_updatedAt_key" ON "Content"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Dog_createdAt_key" ON "Dog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Dog_updatedAt_key" ON "Dog"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_createdAt_key" ON "Equipment"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_updatedAt_key" ON "Equipment"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Flight_createdAt_key" ON "Flight"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Flight_updatedAt_key" ON "Flight"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Horse_createdAt_key" ON "Horse"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Horse_updatedAt_key" ON "Horse"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "List_createdAt_key" ON "List"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "List_updatedAt_key" ON "List"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Movie_createdAt_key" ON "Movie"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Movie_updatedAt_key" ON "Movie"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_createdAt_key" ON "Partner"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_updatedAt_key" ON "Partner"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Photo_createdAt_key" ON "Photo"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Photo_updatedAt_key" ON "Photo"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Post_createdAt_key" ON "Post"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Post_updatedAt_key" ON "Post"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_createdAt_key" ON "Seat"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_updatedAt_key" ON "Seat"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_createdAt_key" ON "Setting"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_updatedAt_key" ON "Setting"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Shoe_createdAt_key" ON "Shoe"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Shoe_updatedAt_key" ON "Shoe"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sweater_createdAt_key" ON "Sweater"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sweater_updatedAt_key" ON "Sweater"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Thing_createdAt_key" ON "Thing"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Thing_updatedAt_key" ON "Thing"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Trial_createdAt_key" ON "Trial"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Trial_updatedAt_key" ON "Trial"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_createdAt_key" ON "Trip"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_updatedAt_key" ON "Trip"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_createdAt_key" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_updatedAt_key" ON "User"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random0_createdAt_key" ON "Random0"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random0_updatedAt_key" ON "Random0"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random1_createdAt_key" ON "Random1"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random1_updatedAt_key" ON "Random1"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random2_createdAt_key" ON "Random2"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random2_updatedAt_key" ON "Random2"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random3_createdAt_key" ON "Random3"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random3_updatedAt_key" ON "Random3"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random4_createdAt_key" ON "Random4"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random4_updatedAt_key" ON "Random4"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random5_createdAt_key" ON "Random5"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random5_updatedAt_key" ON "Random5"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random6_createdAt_key" ON "Random6"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random6_updatedAt_key" ON "Random6"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random7_createdAt_key" ON "Random7"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random7_updatedAt_key" ON "Random7"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random8_createdAt_key" ON "Random8"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random8_updatedAt_key" ON "Random8"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random9_createdAt_key" ON "Random9"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random9_updatedAt_key" ON "Random9"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random10_createdAt_key" ON "Random10"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random10_updatedAt_key" ON "Random10"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random11_createdAt_key" ON "Random11"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random11_updatedAt_key" ON "Random11"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random12_createdAt_key" ON "Random12"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random12_updatedAt_key" ON "Random12"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random13_createdAt_key" ON "Random13"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random13_updatedAt_key" ON "Random13"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random14_createdAt_key" ON "Random14"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random14_updatedAt_key" ON "Random14"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random15_createdAt_key" ON "Random15"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random15_updatedAt_key" ON "Random15"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random16_createdAt_key" ON "Random16"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random16_updatedAt_key" ON "Random16"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random17_createdAt_key" ON "Random17"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random17_updatedAt_key" ON "Random17"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random18_createdAt_key" ON "Random18"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random18_updatedAt_key" ON "Random18"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random19_createdAt_key" ON "Random19"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random19_updatedAt_key" ON "Random19"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random20_createdAt_key" ON "Random20"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random20_updatedAt_key" ON "Random20"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random21_createdAt_key" ON "Random21"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random21_updatedAt_key" ON "Random21"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random22_createdAt_key" ON "Random22"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random22_updatedAt_key" ON "Random22"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random23_createdAt_key" ON "Random23"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random23_updatedAt_key" ON "Random23"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random24_createdAt_key" ON "Random24"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random24_updatedAt_key" ON "Random24"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random25_createdAt_key" ON "Random25"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random25_updatedAt_key" ON "Random25"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random26_createdAt_key" ON "Random26"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random26_updatedAt_key" ON "Random26"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random27_createdAt_key" ON "Random27"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random27_updatedAt_key" ON "Random27"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random28_createdAt_key" ON "Random28"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random28_updatedAt_key" ON "Random28"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random29_createdAt_key" ON "Random29"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random29_updatedAt_key" ON "Random29"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random30_createdAt_key" ON "Random30"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random30_updatedAt_key" ON "Random30"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random31_createdAt_key" ON "Random31"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random31_updatedAt_key" ON "Random31"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random32_createdAt_key" ON "Random32"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random32_updatedAt_key" ON "Random32"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random33_createdAt_key" ON "Random33"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random33_updatedAt_key" ON "Random33"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random34_createdAt_key" ON "Random34"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random34_updatedAt_key" ON "Random34"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random35_createdAt_key" ON "Random35"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random35_updatedAt_key" ON "Random35"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random36_createdAt_key" ON "Random36"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random36_updatedAt_key" ON "Random36"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random37_createdAt_key" ON "Random37"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random37_updatedAt_key" ON "Random37"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random38_createdAt_key" ON "Random38"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random38_updatedAt_key" ON "Random38"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random39_createdAt_key" ON "Random39"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random39_updatedAt_key" ON "Random39"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random40_createdAt_key" ON "Random40"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random40_updatedAt_key" ON "Random40"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random41_createdAt_key" ON "Random41"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random41_updatedAt_key" ON "Random41"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random42_createdAt_key" ON "Random42"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random42_updatedAt_key" ON "Random42"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random43_createdAt_key" ON "Random43"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random43_updatedAt_key" ON "Random43"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random44_createdAt_key" ON "Random44"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random44_updatedAt_key" ON "Random44"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random45_createdAt_key" ON "Random45"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random45_updatedAt_key" ON "Random45"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random46_createdAt_key" ON "Random46"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random46_updatedAt_key" ON "Random46"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random47_createdAt_key" ON "Random47"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random47_updatedAt_key" ON "Random47"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random48_createdAt_key" ON "Random48"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random48_updatedAt_key" ON "Random48"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random49_createdAt_key" ON "Random49"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random49_updatedAt_key" ON "Random49"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random50_createdAt_key" ON "Random50"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Random50_updatedAt_key" ON "Random50"("updatedAt");
