-- Tracks the booking hold deadline used by Stripe redirect payment methods.
ALTER TABLE payment
  ADD COLUMN payment_hold_expires_at DATETIME NULL AFTER stripe_status;
