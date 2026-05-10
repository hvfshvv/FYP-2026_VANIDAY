-- Add commission breakdown columns to PAYMENT table
-- Run this only if upgrading an existing database created before these columns were added.
-- Fresh installs using schema.sql already include these columns.
USE `SOI-2026-0052-mizyana`;

ALTER TABLE PAYMENT
  ADD COLUMN IF NOT EXISTS commission_pct  DECIMAL(5,2)   NOT NULL DEFAULT 20.00,
  ADD COLUMN IF NOT EXISTS vaniday_share   DECIMAL(10,2)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS merchant_share  DECIMAL(10,2)  DEFAULT NULL;
