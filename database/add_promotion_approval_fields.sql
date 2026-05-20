-- Safe migration for merchant-submitted promotion approval workflow.
-- Re-runnable. Does not remove or rewrite existing promotions.

SET @db_name = DATABASE();

SET @has_discount_pct = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'promotion'
    AND COLUMN_NAME = 'discount_pct'
);

SET @sql = IF(
  @has_discount_pct = 0,
  'ALTER TABLE promotion ADD COLUMN discount_pct DECIMAL(5,2) NULL AFTER description',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_service_id = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'promotion'
    AND COLUMN_NAME = 'service_id'
);

SET @sql = IF(
  @has_service_id = 0,
  'ALTER TABLE promotion ADD COLUMN service_id INT NULL AFTER merchant_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_offer_text = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'promotion'
    AND COLUMN_NAME = 'offer_text'
);

SET @sql = IF(
  @has_offer_text = 0,
  'ALTER TABLE promotion ADD COLUMN offer_text VARCHAR(150) NULL AFTER discount_pct',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_approval_status = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'promotion'
    AND COLUMN_NAME = 'approval_status'
);

SET @sql = IF(
  @has_approval_status = 0,
  'ALTER TABLE promotion ADD COLUMN approval_status ENUM(''pending'', ''approved'', ''rejected'') NOT NULL DEFAULT ''approved'' AFTER is_active',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_submitted_by_merchant = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'promotion'
    AND COLUMN_NAME = 'submitted_by_merchant'
);

SET @sql = IF(
  @has_submitted_by_merchant = 0,
  'ALTER TABLE promotion ADD COLUMN submitted_by_merchant BOOLEAN NOT NULL DEFAULT TRUE AFTER approval_status',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_rejection_reason = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'promotion'
    AND COLUMN_NAME = 'rejection_reason'
);

SET @sql = IF(
  @has_rejection_reason = 0,
  'ALTER TABLE promotion ADD COLUMN rejection_reason TEXT NULL AFTER submitted_by_merchant',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_approved_by_admin_id = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'promotion'
    AND COLUMN_NAME = 'approved_by_admin_id'
);

SET @sql = IF(
  @has_approved_by_admin_id = 0,
  'ALTER TABLE promotion ADD COLUMN approved_by_admin_id INT NULL AFTER rejection_reason',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_approved_at = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'promotion'
    AND COLUMN_NAME = 'approved_at'
);

SET @sql = IF(
  @has_approved_at = 0,
  'ALTER TABLE promotion ADD COLUMN approved_at DATETIME NULL AFTER approved_by_admin_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_submitted_at = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'promotion'
    AND COLUMN_NAME = 'submitted_at'
);

SET @sql = IF(
  @has_submitted_at = 0,
  'ALTER TABLE promotion ADD COLUMN submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP AFTER approved_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE promotion
SET approval_status = COALESCE(approval_status, 'approved'),
    submitted_by_merchant = COALESCE(submitted_by_merchant, 1),
    approved_at = CASE
      WHEN approval_status = 'approved' THEN COALESCE(approved_at, submitted_at, NOW())
      ELSE approved_at
    END;

SET @has_promotion_service_idx = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'promotion'
    AND INDEX_NAME = 'idx_promotion_service'
);

SET @sql = IF(
  @has_promotion_service_idx = 0,
  'ALTER TABLE promotion ADD INDEX idx_promotion_service (service_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_promotion_service_fk = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'promotion'
    AND COLUMN_NAME = 'service_id'
    AND REFERENCED_TABLE_NAME = 'service'
);

SET @sql = IF(
  @has_promotion_service_fk = 0,
  'ALTER TABLE promotion ADD CONSTRAINT fk_promotion_service FOREIGN KEY (service_id) REFERENCES service(service_id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_promotion_admin_fk = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'promotion'
    AND COLUMN_NAME = 'approved_by_admin_id'
    AND REFERENCED_TABLE_NAME = 'users'
);

SET @sql = IF(
  @has_promotion_admin_fk = 0,
  'ALTER TABLE promotion ADD CONSTRAINT fk_promotion_approved_by_admin FOREIGN KEY (approved_by_admin_id) REFERENCES users(user_id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
