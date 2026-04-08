-- Phase 1: Create User and Session tables
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- Phase 1: Add nullable columns
ALTER TABLE "UserProfile" ADD COLUMN "authUserId" TEXT;
CREATE UNIQUE INDEX "UserProfile_authUserId_key" ON "UserProfile"("authUserId");
ALTER TABLE "JobAnalysis" ADD COLUMN "userId" TEXT;
ALTER TABLE "DiscoveredJob" ADD COLUMN "userId" TEXT;
ALTER TABLE "CompanyWatchlist" ADD COLUMN "userId" TEXT;
ALTER TABLE "VCSource" ADD COLUMN "userId" TEXT;

-- Phase 2: Create default user from existing profile
INSERT INTO "User" ("id", "email", "passwordHash", "createdAt", "updatedAt")
SELECT 'default-user-' || "id", "email", '__NEEDS_PASSWORD_RESET__', NOW(), NOW()
FROM "UserProfile" ORDER BY "createdAt" ASC LIMIT 1;

-- Phase 2: Backfill all records
UPDATE "UserProfile" SET "authUserId" = (SELECT "id" FROM "User" LIMIT 1) WHERE "authUserId" IS NULL;
UPDATE "JobAnalysis" ja SET "userId" = (SELECT a."userId" FROM "Application" a WHERE a."jobId" = ja."jobId" LIMIT 1) WHERE ja."userId" IS NULL;
UPDATE "JobAnalysis" SET "userId" = (SELECT "id" FROM "UserProfile" ORDER BY "createdAt" LIMIT 1) WHERE "userId" IS NULL;
UPDATE "DiscoveredJob" SET "userId" = (SELECT "id" FROM "UserProfile" ORDER BY "createdAt" LIMIT 1) WHERE "userId" IS NULL;
UPDATE "CompanyWatchlist" SET "userId" = (SELECT "id" FROM "UserProfile" ORDER BY "createdAt" LIMIT 1) WHERE "userId" IS NULL;
UPDATE "VCSource" SET "userId" = (SELECT "id" FROM "UserProfile" ORDER BY "createdAt" LIMIT 1) WHERE "userId" IS NULL;

-- Phase 3: Enforce NOT NULL
ALTER TABLE "UserProfile" ALTER COLUMN "authUserId" SET NOT NULL;
ALTER TABLE "JobAnalysis" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "DiscoveredJob" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "CompanyWatchlist" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "VCSource" ALTER COLUMN "userId" SET NOT NULL;

-- Phase 3: Add foreign keys
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_authUserId_fkey" FOREIGN KEY ("authUserId") REFERENCES "User"("id") ON DELETE CASCADE;
ALTER TABLE "JobAnalysis" ADD CONSTRAINT "JobAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DiscoveredJob" ADD CONSTRAINT "DiscoveredJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyWatchlist" ADD CONSTRAINT "CompanyWatchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VCSource" ADD CONSTRAINT "VCSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
