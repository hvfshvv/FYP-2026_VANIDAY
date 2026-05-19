-- Add optional birthday support for customer profiles.
-- Safe to run more than once.

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
