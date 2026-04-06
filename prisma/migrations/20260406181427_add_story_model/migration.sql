-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "detailedVersion" TEXT NOT NULL,
    "talkingPointsVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Story_applicationId_key" ON "Story"("applicationId");

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
