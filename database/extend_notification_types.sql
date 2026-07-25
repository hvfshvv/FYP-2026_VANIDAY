-- Keeps outbound notification audit types extensible for WhatsApp disruption
-- events such as staff replacement proposals and acceptance confirmations.
ALTER TABLE notification
  MODIFY notification_type VARCHAR(64) NOT NULL;
