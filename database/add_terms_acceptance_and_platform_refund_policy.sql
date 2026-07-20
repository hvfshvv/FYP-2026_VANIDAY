SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merchant' AND COLUMN_NAME = 'terms_accepted_at') = 0,
  'ALTER TABLE merchant ADD COLUMN terms_accepted_at DATETIME NULL AFTER verification_status', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merchant' AND COLUMN_NAME = 'terms_version') = 0,
  'ALTER TABLE merchant ADD COLUMN terms_version VARCHAR(32) NULL AFTER terms_accepted_at', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE merchant
SET refund_percentage = LEAST(COALESCE(refund_percentage, 95), 95),
    min_cancel_hours = GREATEST(COALESCE(min_cancel_hours, 6), 6),
    cancellation_policy_active = COALESCE(cancellation_policy_active, TRUE);
