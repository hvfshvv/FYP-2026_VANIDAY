-- Adds the optional status values and DB-level duplicate guard expected by
-- the persisted WhatsApp session flow.
--
-- Run this after backing up the database. If your MySQL version does not
-- support generated columns, skip active_phone and keep the application-level
-- duplicate cleanup in models/whatsappModel.js.

-- Keep only the newest active session per phone before adding the unique guard.
UPDATE whatsapp_session older
JOIN whatsapp_session newer
  ON newer.phone = older.phone
 AND newer.status = 'active'
 AND older.status = 'active'
 AND newer.session_id > older.session_id
SET older.status = 'abandoned',
    older.updated_at = CURRENT_TIMESTAMP;

ALTER TABLE whatsapp_session
  MODIFY status ENUM('active', 'completed', 'abandoned', 'inactive', 'expired') DEFAULT 'active';

ALTER TABLE whatsapp_session
  ADD COLUMN active_phone VARCHAR(20)
    GENERATED ALWAYS AS (CASE WHEN status = 'active' THEN phone ELSE NULL END) STORED;

CREATE UNIQUE INDEX uq_whatsapp_session_active_phone
  ON whatsapp_session (active_phone);
