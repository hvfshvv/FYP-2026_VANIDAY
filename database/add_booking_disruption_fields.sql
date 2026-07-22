-- Adds merchant disruption state to existing booking and time_slot tables.
-- Safe to run repeatedly: existing columns are skipped.

DROP PROCEDURE IF EXISTS add_column_if_missing;

DELIMITER //
CREATE PROCEDURE add_column_if_missing(
  IN target_table VARCHAR(64),
  IN target_column VARCHAR(64),
  IN column_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = target_table
      AND COLUMN_NAME = target_column
  ) THEN
    SET @column_ddl = CONCAT(
      'ALTER TABLE `', REPLACE(target_table, '`', '``'),
      '` ADD COLUMN `', REPLACE(target_column, '`', '``'),
      '` ', column_definition
    );
    PREPARE column_statement FROM @column_ddl;
    EXECUTE column_statement;
    DEALLOCATE PREPARE column_statement;
  END IF;
END //
DELIMITER ;

CALL add_column_if_missing('booking', 'cancelled_by', 'ENUM(''customer'',''merchant'',''admin'') NULL');
CALL add_column_if_missing('booking', 'cancellation_reason', 'TEXT NULL');
CALL add_column_if_missing('booking', 'proposed_staff_id', 'INT NULL');
CALL add_column_if_missing('booking', 'staff_change_reason', 'TEXT NULL');
CALL add_column_if_missing('booking', 'staff_change_status', 'ENUM(''pending'',''accepted'',''reschedule_requested'',''cancelled'') NULL');
CALL add_column_if_missing('booking', 'staff_change_requested_at', 'DATETIME NULL');
CALL add_column_if_missing('booking', 'staff_change_responded_at', 'DATETIME NULL');

CALL add_column_if_missing('time_slot', 'block_type', 'ENUM(''staff_unavailable'',''merchant_cancellation'',''emergency_closure'') NULL');
CALL add_column_if_missing('time_slot', 'block_reason', 'TEXT NULL');

DROP PROCEDURE IF EXISTS add_column_if_missing;
