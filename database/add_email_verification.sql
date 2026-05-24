-- Email verification for newly registered accounts.
-- Safe to run more than once.

SET @db_name = DATABASE();

SET @has_email_verified_at = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'email_verified_at'
);

SET @sql = IF(
  @has_email_verified_at = 0,
  'ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL AFTER status',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE users
SET email_verified_at = COALESCE(email_verified_at, created_at, NOW())
WHERE email_verified_at IS NULL;

CREATE TABLE IF NOT EXISTS email_verification_token (
  verification_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

SET @has_email_verification_user_idx = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'email_verification_token'
    AND INDEX_NAME = 'idx_email_verification_user'
);

SET @sql = IF(
  @has_email_verification_user_idx = 0,
  'CREATE INDEX idx_email_verification_user ON email_verification_token (user_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_email_verification_expires_idx = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'email_verification_token'
    AND INDEX_NAME = 'idx_email_verification_expires'
);

SET @sql = IF(
  @has_email_verification_expires_idx = 0,
  'CREATE INDEX idx_email_verification_expires ON email_verification_token (expires_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
