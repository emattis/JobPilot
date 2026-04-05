-- AlterTable
ALTER TABLE "JobPosting" ADD COLUMN     "roleAnalysisCache" TEXT,
ADD COLUMN     "roleAnalysisCachedAt" TIMESTAMP(3);
