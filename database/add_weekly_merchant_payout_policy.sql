SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment' AND COLUMN_NAME = 'processor_fee_amount') = 0,
  'ALTER TABLE payment ADD COLUMN processor_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER amount', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment' AND COLUMN_NAME = 'dispute_fee_amount') = 0,
  'ALTER TABLE payment ADD COLUMN dispute_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER processor_fee_amount', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment' AND COLUMN_NAME = 'merchant_payout_id') = 0,
  'ALTER TABLE payment ADD COLUMN merchant_payout_id INT NULL AFTER merchant_payout_at', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS merchant_payout (
  payout_id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  status ENUM('pending','processing','paid','failed','cancelled') NOT NULL DEFAULT 'pending',
  gross_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  platform_commission DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  processor_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  dispute_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  payout_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  booking_count INT NOT NULL DEFAULT 0,
  payout_period_start DATE NULL,
  payout_period_end DATE NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'sgd',
  payout_reference VARCHAR(255) NULL,
  admin_note VARCHAR(500) NULL,
  created_by INT NULL,
  paid_by INT NULL,
  paid_at DATETIME NULL,
  failed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_merchant_payout_merchant_status (merchant_id, status),
  KEY idx_merchant_payout_created (created_at),
  CONSTRAINT fk_merchant_payout_merchant FOREIGN KEY (merchant_id) REFERENCES merchant(merchant_id),
  CONSTRAINT fk_merchant_payout_created_by FOREIGN KEY (created_by) REFERENCES users(user_id),
  CONSTRAINT fk_merchant_payout_paid_by FOREIGN KEY (paid_by) REFERENCES users(user_id)
);

SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merchant_payout' AND COLUMN_NAME = 'processor_fee_amount') = 0,
  'ALTER TABLE merchant_payout ADD COLUMN processor_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER platform_commission', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merchant_payout' AND COLUMN_NAME = 'dispute_fee_amount') = 0,
  'ALTER TABLE merchant_payout ADD COLUMN dispute_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER processor_fee_amount', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merchant_payout' AND COLUMN_NAME = 'payout_period_start') = 0,
  'ALTER TABLE merchant_payout ADD COLUMN payout_period_start DATE NULL AFTER booking_count', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merchant_payout' AND COLUMN_NAME = 'payout_period_end') = 0,
  'ALTER TABLE merchant_payout ADD COLUMN payout_period_end DATE NULL AFTER payout_period_start', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merchant_payout_item') > 0,
  'UPDATE payment p JOIN merchant_payout_item mpi ON mpi.payment_id = p.payment_id SET p.merchant_payout_id = mpi.payout_id WHERE p.merchant_payout_id IS NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merchant_payout_item') > 0,
  'DROP TABLE merchant_payout_item', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
