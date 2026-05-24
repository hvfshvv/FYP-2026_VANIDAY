-- Voucher checkout and pending-payment expiry support.
-- Re-runnable. Adds booking discount fields and the customer voucher claim table.

SET @db_name = DATABASE();

SET @has_applied_promo_id = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'booking'
    AND COLUMN_NAME = 'applied_promo_id'
);

SET @sql = IF(
  @has_applied_promo_id = 0,
  'ALTER TABLE booking ADD COLUMN applied_promo_id INT NULL AFTER voucher_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_discount_amount = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'booking'
    AND COLUMN_NAME = 'discount_amount'
);

SET @sql = IF(
  @has_discount_amount = 0,
  'ALTER TABLE booking ADD COLUMN discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER applied_promo_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_applied_cv_id = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'booking'
    AND COLUMN_NAME = 'applied_cv_id'
);

SET @sql = IF(
  @has_applied_cv_id = 0,
  'ALTER TABLE booking ADD COLUMN applied_cv_id INT NULL AFTER discount_amount',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_voucher_discount_amount = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'booking'
    AND COLUMN_NAME = 'voucher_discount_amount'
);

SET @sql = IF(
  @has_voucher_discount_amount = 0,
  'ALTER TABLE booking ADD COLUMN voucher_discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER applied_cv_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS customer_voucher (
  cv_id        INT AUTO_INCREMENT PRIMARY KEY,
  customer_id  INT NOT NULL,
  voucher_id   INT NOT NULL,
  claimed_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  status       ENUM('active','used','expired') DEFAULT 'active',
  used_at      DATETIME NULL,
  INDEX idx_cv_customer (customer_id),
  INDEX idx_cv_voucher (voucher_id),
  FOREIGN KEY (customer_id) REFERENCES users(user_id),
  FOREIGN KEY (voucher_id)  REFERENCES voucher(voucher_id)
);

SET @has_booking_pending_idx = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'booking'
    AND INDEX_NAME = 'idx_booking_pending_payment'
);

SET @sql = IF(
  @has_booking_pending_idx = 0,
  'CREATE INDEX idx_booking_pending_payment ON booking (status, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_cv_customer_status_idx = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'customer_voucher'
    AND INDEX_NAME = 'idx_cv_customer_status'
);

SET @sql = IF(
  @has_cv_customer_status_idx = 0,
  'CREATE INDEX idx_cv_customer_status ON customer_voucher (customer_id, status)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
