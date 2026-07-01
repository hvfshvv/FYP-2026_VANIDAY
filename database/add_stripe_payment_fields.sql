ALTER TABLE payment
  ADD COLUMN payment_ref VARCHAR(255) NULL AFTER transaction_ref,
  ADD COLUMN stripe_payment_intent_id VARCHAR(255) NULL AFTER payment_ref,
  ADD COLUMN stripe_checkout_session_id VARCHAR(255) NULL AFTER stripe_payment_intent_id,
  ADD COLUMN stripe_latest_charge_id VARCHAR(255) NULL AFTER stripe_checkout_session_id,
  ADD COLUMN stripe_balance_transaction_id VARCHAR(255) NULL AFTER stripe_latest_charge_id,
  ADD COLUMN stripe_status VARCHAR(64) NULL AFTER stripe_balance_transaction_id,
  ADD COLUMN payment_hold_expires_at DATETIME NULL AFTER stripe_status,
  ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'sgd' AFTER amount,
  ADD COLUMN receipt_url VARCHAR(512) NULL AFTER payment_hold_expires_at;
