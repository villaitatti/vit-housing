-- CreateEnum
CREATE TYPE "Role" AS ENUM ('HOUSE_USER', 'HOUSE_LANDLORD', 'HOUSE_ADMIN');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('EN', 'IT');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "auth0_user_id" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'HOUSE_USER',
    "preferred_language" "Language" NOT NULL DEFAULT 'EN',
    "phone_number" TEXT,
    "mobile_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "language" "Language" NOT NULL,
    "token" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "invited_by" INTEGER NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "address_1" TEXT NOT NULL,
    "address_2" TEXT,
    "postal_code" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "monthly_rent" DECIMAL(65,30) NOT NULL,
    "deposit" DECIMAL(65,30),
    "condominium_expenses" DECIMAL(65,30),
    "utility_electricity" BOOLEAN NOT NULL DEFAULT false,
    "utility_gas" BOOLEAN NOT NULL DEFAULT false,
    "utility_water" BOOLEAN NOT NULL DEFAULT false,
    "utility_telephone" BOOLEAN NOT NULL DEFAULT false,
    "utility_internet" BOOLEAN NOT NULL DEFAULT false,
    "accommodation_type" TEXT NOT NULL,
    "floor" TEXT NOT NULL,
    "bathrooms" INTEGER NOT NULL,
    "bedrooms" INTEGER NOT NULL,
    "floor_space" INTEGER,
    "feature_storage_room" BOOLEAN NOT NULL DEFAULT false,
    "feature_basement" BOOLEAN NOT NULL DEFAULT false,
    "feature_garden" BOOLEAN NOT NULL DEFAULT false,
    "feature_balcony" BOOLEAN NOT NULL DEFAULT false,
    "feature_air_con" BOOLEAN NOT NULL DEFAULT false,
    "feature_washing_machine" BOOLEAN NOT NULL DEFAULT false,
    "feature_dryer" BOOLEAN NOT NULL DEFAULT false,
    "feature_fireplace" BOOLEAN NOT NULL DEFAULT false,
    "feature_dishwasher" BOOLEAN NOT NULL DEFAULT false,
    "feature_elevator" BOOLEAN NOT NULL DEFAULT false,
    "feature_tv" BOOLEAN NOT NULL DEFAULT false,
    "feature_telephone" BOOLEAN NOT NULL DEFAULT false,
    "feature_wifi" BOOLEAN NOT NULL DEFAULT false,
    "feature_wired_internet" BOOLEAN NOT NULL DEFAULT false,
    "feature_parking" BOOLEAN NOT NULL DEFAULT false,
    "feature_pets_allowed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "owner_id" INTEGER NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailableDate" (
    "id" SERIAL NOT NULL,
    "listing_id" INTEGER NOT NULL,
    "available_from" TIMESTAMP(3) NOT NULL,
    "available_to" TIMESTAMP(3),

    CONSTRAINT "AvailableDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingPhoto" (
    "id" SERIAL NOT NULL,
    "listing_id" INTEGER NOT NULL,
    "s3_key" TEXT NOT NULL,
    "s3_url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ListingPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_auth0_user_id_key" ON "User"("auth0_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailableDate" ADD CONSTRAINT "AvailableDate_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingPhoto" ADD CONSTRAINT "ListingPhoto_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
