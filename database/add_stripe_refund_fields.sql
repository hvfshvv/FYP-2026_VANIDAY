ALTER TABLE payment
  ADD COLUMN stripe_refund_id VARCHAR(255) NULL AFTER refund_amount,
  ADD COLUMN stripe_refund_status VARCHAR(64) NULL AFTER stripe_refund_id;
