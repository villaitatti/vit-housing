-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'HOUSE_IT_ADMIN';

-- CreateTable
CREATE TABLE "ServiceConfig" (
    "id" SERIAL NOT NULL,
    "service" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "is_secret" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "ServiceConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auth0RoleMapping" (
    "id" SERIAL NOT NULL,
    "auth0_role_id" TEXT NOT NULL,
    "auth0_role_name" TEXT NOT NULL,
    "local_role" "Role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Auth0RoleMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceConfig_service_key_key" ON "ServiceConfig"("service", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Auth0RoleMapping_auth0_role_id_key" ON "Auth0RoleMapping"("auth0_role_id");

-- AddForeignKey
ALTER TABLE "ServiceConfig" ADD CONSTRAINT "ServiceConfig_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
