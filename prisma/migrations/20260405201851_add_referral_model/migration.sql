-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('DRAFT', 'SENT', 'RESPONDED', 'REFERRED', 'DECLINED', 'NO_RESPONSE');

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactRole" TEXT,
    "contactCompany" TEXT,
    "contactLinkedin" TEXT,
    "relationship" TEXT NOT NULL,
    "messageTemplate" TEXT,
    "messageSentAt" TIMESTAMP(3),
    "responseReceivedAt" TIMESTAMP(3),
    "referralMade" BOOLEAN NOT NULL DEFAULT false,
    "referralDate" TIMESTAMP(3),
    "notes" TEXT,
    "status" "ReferralStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
