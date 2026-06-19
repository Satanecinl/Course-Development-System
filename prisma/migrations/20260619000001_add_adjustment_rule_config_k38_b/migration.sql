-- K38-B: Add AdjustmentRuleConfig singleton table for adjustment rule settings
CREATE TABLE "AdjustmentRuleConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL DEFAULT 'default',
    "defaultRecommendationLimit" INTEGER NOT NULL DEFAULT 5,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "AdjustmentRuleConfig_key_key" ON "AdjustmentRuleConfig"("key");
