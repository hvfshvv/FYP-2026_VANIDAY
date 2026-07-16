-- Customer review editing and admin post-moderation.
-- Safe to run after database/consolidate_schema.sql.

SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'updated_at') = 0,
  'ALTER TABLE reviews ADD COLUMN updated_at DATETIME NULL AFTER merchant_replied_at', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'visibility') = 0,
  'ALTER TABLE reviews ADD COLUMN visibility ENUM(''visible'',''hidden'') NOT NULL DEFAULT ''visible'' AFTER updated_at', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'hidden_at') = 0,
  'ALTER TABLE reviews ADD COLUMN hidden_at DATETIME NULL AFTER visibility', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'hidden_by') = 0,
  'ALTER TABLE reviews ADD COLUMN hidden_by INT NULL AFTER hidden_at', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'hidden_reason') = 0,
  'ALTER TABLE reviews ADD COLUMN hidden_reason VARCHAR(255) NULL AFTER hidden_by', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'photo_hidden') = 0,
  'ALTER TABLE reviews ADD COLUMN photo_hidden BOOLEAN NOT NULL DEFAULT FALSE AFTER hidden_reason', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'photo_bonus_awarded_at') = 0,
  'ALTER TABLE reviews ADD COLUMN photo_bonus_awarded_at DATETIME NULL AFTER photo_hidden', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE reviews r
JOIN transactions t
  ON t.booking_id = r.booking_id
 AND t.transaction_type = 'review_bonus'
 AND t.points_amount >= 3
SET r.photo_bonus_awarded_at = COALESCE(t.completed_at, t.created_at, r.created_at)
WHERE r.review_target = 'merchant'
  AND r.review_image_data IS NOT NULL;

SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'edit_count') = 0,
  'ALTER TABLE reviews ADD COLUMN edit_count INT NOT NULL DEFAULT 0 AFTER photo_bonus_awarded_at', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'last_edit_summary') = 0,
  'ALTER TABLE reviews ADD COLUMN last_edit_summary JSON NULL AFTER edit_count', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'removal_request_status') = 0,
  'ALTER TABLE reviews ADD COLUMN removal_request_status ENUM(''none'',''pending'',''approved'',''rejected'') NOT NULL DEFAULT ''none'' AFTER last_edit_summary', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'removal_reason_type') = 0,
  'ALTER TABLE reviews ADD COLUMN removal_reason_type ENUM(''confidential'',''wrong_photo'',''safety'',''other'') NULL AFTER removal_request_status', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'removal_reason_text') = 0,
  'ALTER TABLE reviews ADD COLUMN removal_reason_text VARCHAR(500) NULL AFTER removal_reason_type', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'removal_requested_at') = 0,
  'ALTER TABLE reviews ADD COLUMN removal_requested_at DATETIME NULL AFTER removal_reason_text', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'removal_reviewed_by') = 0,
  'ALTER TABLE reviews ADD COLUMN removal_reviewed_by INT NULL AFTER removal_requested_at', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'removal_reviewed_at') = 0,
  'ALTER TABLE reviews ADD COLUMN removal_reviewed_at DATETIME NULL AFTER removal_reviewed_by', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'removal_admin_note') = 0,
  'ALTER TABLE reviews ADD COLUMN removal_admin_note VARCHAR(500) NULL AFTER removal_reviewed_at', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
