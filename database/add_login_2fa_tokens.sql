-- One-time email sign-in links after password login.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS login_2fa_token (
  login_2fa_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  next_path VARCHAR(2048) NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

SET @db_name = DATABASE();

SET @has_login_2fa_user_idx = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'login_2fa_token'
    AND INDEX_NAME = 'idx_login_2fa_user'
);

SET @sql = IF(
  @has_login_2fa_user_idx = 0,
  'CREATE INDEX idx_login_2fa_user ON login_2fa_token (user_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_login_2fa_expires_idx = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'login_2fa_token'
    AND INDEX_NAME = 'idx_login_2fa_expires'
);

SET @sql = IF(
  @has_login_2fa_expires_idx = 0,
  'CREATE INDEX idx_login_2fa_expires ON login_2fa_token (expires_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
