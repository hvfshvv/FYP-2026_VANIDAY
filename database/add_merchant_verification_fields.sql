-- Add merchant validation workflow fields for existing databases.
-- Run this once in phpMyAdmin or MySQL CLI before testing merchant approvals.

ALTER TABLE merchant
  ADD COLUMN business_uen VARCHAR(20) NULL AFTER address,
  ADD COLUMN verification_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending' AFTER is_active,
  ADD COLUMN verification_notes TEXT NULL AFTER verification_status,
  ADD COLUMN submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP AFTER verification_notes,
  ADD COLUMN verified_at DATETIME NULL AFTER submitted_at,
  ADD COLUMN verified_by INT NULL AFTER verified_at;

ALTER TABLE merchant
  ADD CONSTRAINT fk_merchant_verified_by
  FOREIGN KEY (verified_by) REFERENCES users(user_id);

UPDATE merchant
SET verification_status = 'approved',
    verified_at = COALESCE(verified_at, NOW())
WHERE verification_status IS NULL
   OR verification_status = 'pending';
