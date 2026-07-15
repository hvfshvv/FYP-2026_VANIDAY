-- Run only after the application has used the unified schema successfully and
-- the reconciliation queries in database/verify_consolidated_schema.sql pass.
-- Select the intended schema as default before running this file manually.
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS wallet_transaction;
DROP TABLE IF EXISTS loyalty_transaction;
DROP TABLE IF EXISTS payment_wallet;
DROP TABLE IF EXISTS loyalty_wallet;
DROP TABLE IF EXISTS platform_feedback;
DROP TABLE IF EXISTS merchant_review;
DROP TABLE IF EXISTS cancellation_policy;
DROP TABLE IF EXISTS schema_migration;
DROP TABLE IF EXISTS schema_migrations;
SET FOREIGN_KEY_CHECKS = 1;
