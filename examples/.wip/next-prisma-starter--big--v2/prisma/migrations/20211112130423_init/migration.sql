-- CreateTable
CREATE TABLE "Animal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Backpack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Bag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Book" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Bookcase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Bottle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Calendar" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Cat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Content" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Dog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Flight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Horse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "List" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Movie" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Seat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Shoe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Sweater" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Thing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Trial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Router26" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Router27" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Router28" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Router29" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Router30" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Router31" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Router32" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Router33" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Router34" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Router35" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Router36" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Router37" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Router38" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Router39" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Router40" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Router41" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Router42" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Router43" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Router44" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Router45" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Router46" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Router47" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Router48" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Router49" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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
CREATE UNIQUE INDEX "Router26_createdAt_key" ON "Router26"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router26_updatedAt_key" ON "Router26"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router27_createdAt_key" ON "Router27"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router27_updatedAt_key" ON "Router27"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router28_createdAt_key" ON "Router28"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router28_updatedAt_key" ON "Router28"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router29_createdAt_key" ON "Router29"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router29_updatedAt_key" ON "Router29"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router30_createdAt_key" ON "Router30"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router30_updatedAt_key" ON "Router30"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router31_createdAt_key" ON "Router31"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router31_updatedAt_key" ON "Router31"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router32_createdAt_key" ON "Router32"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router32_updatedAt_key" ON "Router32"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router33_createdAt_key" ON "Router33"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router33_updatedAt_key" ON "Router33"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router34_createdAt_key" ON "Router34"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router34_updatedAt_key" ON "Router34"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router35_createdAt_key" ON "Router35"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router35_updatedAt_key" ON "Router35"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router36_createdAt_key" ON "Router36"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router36_updatedAt_key" ON "Router36"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router37_createdAt_key" ON "Router37"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router37_updatedAt_key" ON "Router37"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router38_createdAt_key" ON "Router38"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router38_updatedAt_key" ON "Router38"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router39_createdAt_key" ON "Router39"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router39_updatedAt_key" ON "Router39"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router40_createdAt_key" ON "Router40"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router40_updatedAt_key" ON "Router40"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router41_createdAt_key" ON "Router41"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router41_updatedAt_key" ON "Router41"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router42_createdAt_key" ON "Router42"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router42_updatedAt_key" ON "Router42"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router43_createdAt_key" ON "Router43"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router43_updatedAt_key" ON "Router43"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router44_createdAt_key" ON "Router44"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router44_updatedAt_key" ON "Router44"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router45_createdAt_key" ON "Router45"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router45_updatedAt_key" ON "Router45"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router46_createdAt_key" ON "Router46"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router46_updatedAt_key" ON "Router46"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router47_createdAt_key" ON "Router47"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router47_updatedAt_key" ON "Router47"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router48_createdAt_key" ON "Router48"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router48_updatedAt_key" ON "Router48"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router49_createdAt_key" ON "Router49"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Router49_updatedAt_key" ON "Router49"("updatedAt");
