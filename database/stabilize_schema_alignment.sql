-- Safe stabilization migration for the current Uniday schema.
-- This file is intended to be re-runnable.

CREATE TABLE IF NOT EXISTS customer (
  customer_id INT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL,
  phone VARCHAR(20) NULL,
  date_of_birth DATE NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(user_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

INSERT IGNORE INTO customer (customer_id, user_id, full_name, email, phone)
SELECT user_id, user_id, full_name, email, phone
FROM users
WHERE role = 'customer';

SET @db_name = DATABASE();

SET @has_customer_birthday = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'customer'
    AND COLUMN_NAME = 'date_of_birth'
);

SET @sql = IF(
  @has_customer_birthday = 0,
  'ALTER TABLE customer ADD COLUMN date_of_birth DATE NULL AFTER phone',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_favourite_service_id = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'favourite'
    AND COLUMN_NAME = 'service_id'
);

SET @sql = IF(
  @has_favourite_service_id = 0,
  'ALTER TABLE favourite ADD COLUMN service_id INT NULL AFTER merchant_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_favourite_customer_idx = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'favourite'
    AND INDEX_NAME = 'idx_favourite_customer'
);

SET @sql = IF(
  @has_favourite_customer_idx = 0,
  'ALTER TABLE favourite ADD INDEX idx_favourite_customer (customer_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_favourite_merchant_idx = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'favourite'
    AND INDEX_NAME = 'idx_favourite_merchant'
);

SET @sql = IF(
  @has_favourite_merchant_idx = 0,
  'ALTER TABLE favourite ADD INDEX idx_favourite_merchant (merchant_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_favourite_service_idx = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'favourite'
    AND INDEX_NAME = 'idx_favourite_service'
);

SET @sql = IF(
  @has_favourite_service_idx = 0,
  'ALTER TABLE favourite ADD INDEX idx_favourite_service (service_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @old_favourite_unique = (
  SELECT INDEX_NAME
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'favourite'
    AND NON_UNIQUE = 0
    AND INDEX_NAME <> 'PRIMARY'
  GROUP BY INDEX_NAME
  HAVING GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) = 'customer_id,merchant_id'
  LIMIT 1
);

SET @sql = IF(
  @old_favourite_unique IS NOT NULL,
  CONCAT('ALTER TABLE favourite DROP INDEX `', @old_favourite_unique, '`'),
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_favourite_scope_col = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'favourite'
    AND COLUMN_NAME = 'favourite_scope_service_id'
);

SET @sql = IF(
  @has_favourite_scope_col = 0,
  'ALTER TABLE favourite ADD COLUMN favourite_scope_service_id INT GENERATED ALWAYS AS (IFNULL(service_id, 0)) STORED',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_favourite_service_unique = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'favourite'
    AND INDEX_NAME = 'uq_favourite_customer_merchant_service'
);

SET @sql = IF(
  @has_favourite_service_unique = 0,
  'ALTER TABLE favourite ADD UNIQUE KEY uq_favourite_customer_merchant_service (customer_id, merchant_id, favourite_scope_service_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_favourite_service_fk = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'favourite'
    AND COLUMN_NAME = 'service_id'
    AND REFERENCED_TABLE_NAME = 'service'
);

SET @sql = IF(
  @has_favourite_service_fk = 0,
  'ALTER TABLE favourite ADD CONSTRAINT fk_favourite_service FOREIGN KEY (service_id) REFERENCES service(service_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
