CREATE TABLE "InteractiveAiBudgetReservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "reservedTokens" INTEGER NOT NULL,
    "actualTokens" INTEGER,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InteractiveAiBudgetReservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InteractiveAiBudgetReservation_tenantId_day_idx"
ON "InteractiveAiBudgetReservation"("tenantId", "day");

CREATE INDEX "InteractiveAiBudgetReservation_tenantId_createdAt_idx"
ON "InteractiveAiBudgetReservation"("tenantId", "createdAt");

ALTER TABLE "InteractiveAiBudgetReservation" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "InteractiveAiBudgetReservation"
ADD CONSTRAINT "InteractiveAiBudgetReservation_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
