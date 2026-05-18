-- Ensure every merchant has merchant-owned booking and arrival QR records.
-- Run this before using the QR flow on an existing database, then run:
--   node database/backfill_merchant_qr_codes.js

ALTER TABLE qr_code
  MODIFY qr_token VARCHAR(255) NOT NULL,
  MODIFY qr_url VARCHAR(255) NOT NULL,
  MODIFY qr_type ENUM('booking', 'check_in', 'general') DEFAULT 'booking';

ALTER TABLE qr_code
  ADD INDEX idx_qr_code_merchant_type_active (merchant_id, qr_type, is_active),
  ADD UNIQUE KEY uq_qr_code_url (qr_url);

UPDATE qr_code
SET qr_type = 'booking'
WHERE qr_type IS NULL OR qr_type = 'general';

-- If old imports produced more than one active QR per merchant/type, keep
-- the newest row active and deactivate the older rows.
UPDATE qr_code older
JOIN qr_code newer
  ON newer.merchant_id = older.merchant_id
 AND newer.qr_type = older.qr_type
 AND newer.is_active = 1
 AND older.is_active = 1
 AND newer.qr_type IN ('booking', 'check_in')
 AND (
      newer.generated_at > older.generated_at
      OR (newer.generated_at = older.generated_at AND newer.qr_id > older.qr_id)
 )
SET older.is_active = 0
WHERE older.qr_type IN ('booking', 'check_in');
