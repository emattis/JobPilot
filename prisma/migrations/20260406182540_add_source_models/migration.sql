-- CreateTable
CREATE TABLE "CompanyWatchlist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "atsType" TEXT NOT NULL,
    "careerUrl" TEXT NOT NULL,
    "vcSource" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastScanned" TIMESTAMP(3),
    "jobsFound" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyWatchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VCSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "portfolioUrl" TEXT NOT NULL,
    "scraperType" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastScanned" TIMESTAMP(3),
    "companiesFound" INTEGER NOT NULL DEFAULT 0,
    "jobsFound" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VCSource_pkey" PRIMARY KEY ("id")
);
