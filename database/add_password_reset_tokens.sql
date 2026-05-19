-- Password reset links for customer/merchant/admin sign in.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS password_reset_token (
  reset_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

SET @db_name = DATABASE();

SET @has_password_reset_user_idx = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'password_reset_token'
    AND INDEX_NAME = 'idx_password_reset_user'
);

SET @sql = IF(
  @has_password_reset_user_idx = 0,
  'CREATE INDEX idx_password_reset_user ON password_reset_token (user_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_password_reset_expires_idx = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'password_reset_token'
    AND INDEX_NAME = 'idx_password_reset_expires'
);

SET @sql = IF(
  @has_password_reset_expires_idx = 0,
  'CREATE INDEX idx_password_reset_expires ON password_reset_token (expires_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
