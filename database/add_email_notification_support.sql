-- Email confirmation/reminder support.
-- Allows guest booking notifications to be logged without a user account.

SET @db_name = DATABASE();

SET @has_notification_table = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'notification'
);

SET @user_id_is_nullable = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'notification'
    AND COLUMN_NAME = 'user_id'
    AND IS_NULLABLE = 'YES'
);

SET @sql = IF(
  @has_notification_table = 1 AND @user_id_is_nullable = 0,
  'ALTER TABLE notification MODIFY user_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
