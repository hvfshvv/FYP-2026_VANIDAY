-- Add explicit rescheduled booking status.
-- Safe to run more than once.

ALTER TABLE booking
  MODIFY status ENUM('pending_payment', 'confirmed', 'rescheduled', 'arrived', 'completed', 'cancelled', 'payment_failed', 'no_show')
  DEFAULT 'pending_payment';
