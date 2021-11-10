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
CREATE TABLE "Book" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Book_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "Cat" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cat_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "Horse" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Horse_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "Flight" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Flight_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "Content" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Content_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "Bottle" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bottle_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "Thing" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Thing_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "Trial" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Animal_createdAt_key" ON "Animal"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Animal_updatedAt_key" ON "Animal"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Book_createdAt_key" ON "Book"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Book_updatedAt_key" ON "Book"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Calendar_createdAt_key" ON "Calendar"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Calendar_updatedAt_key" ON "Calendar"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "List_createdAt_key" ON "List"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "List_updatedAt_key" ON "List"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Movie_createdAt_key" ON "Movie"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Movie_updatedAt_key" ON "Movie"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Post_createdAt_key" ON "Post"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Post_updatedAt_key" ON "Post"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_createdAt_key" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_updatedAt_key" ON "User"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_createdAt_key" ON "Setting"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_updatedAt_key" ON "Setting"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Photo_createdAt_key" ON "Photo"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Photo_updatedAt_key" ON "Photo"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Cat_createdAt_key" ON "Cat"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Cat_updatedAt_key" ON "Cat"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Dog_createdAt_key" ON "Dog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Dog_updatedAt_key" ON "Dog"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Horse_createdAt_key" ON "Horse"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Horse_updatedAt_key" ON "Horse"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_createdAt_key" ON "Seat"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_updatedAt_key" ON "Seat"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Flight_createdAt_key" ON "Flight"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Flight_updatedAt_key" ON "Flight"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_createdAt_key" ON "Trip"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_updatedAt_key" ON "Trip"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Content_createdAt_key" ON "Content"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Content_updatedAt_key" ON "Content"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Backpack_createdAt_key" ON "Backpack"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Backpack_updatedAt_key" ON "Backpack"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Bottle_createdAt_key" ON "Bottle"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Bottle_updatedAt_key" ON "Bottle"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Bag_createdAt_key" ON "Bag"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Bag_updatedAt_key" ON "Bag"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Shoe_createdAt_key" ON "Shoe"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Shoe_updatedAt_key" ON "Shoe"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sweater_createdAt_key" ON "Sweater"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sweater_updatedAt_key" ON "Sweater"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_createdAt_key" ON "Partner"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_updatedAt_key" ON "Partner"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_createdAt_key" ON "Equipment"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_updatedAt_key" ON "Equipment"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Thing_createdAt_key" ON "Thing"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Thing_updatedAt_key" ON "Thing"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Bookcase_createdAt_key" ON "Bookcase"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Bookcase_updatedAt_key" ON "Bookcase"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Trial_createdAt_key" ON "Trial"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Trial_updatedAt_key" ON "Trial"("updatedAt");
