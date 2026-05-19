-- Allow QR bookings to be paid by guests without creating member accounts.
-- Run once on existing databases before accepting guest QR bookings.

ALTER TABLE booking
  MODIFY customer_id INT NULL,
  ADD COLUMN guest_name VARCHAR(150) NULL AFTER customer_id,
  ADD COLUMN guest_email VARCHAR(150) NULL AFTER guest_name,
  ADD COLUMN guest_phone VARCHAR(30) NULL AFTER guest_email;

ALTER TABLE booking
  ADD INDEX idx_booking_guest_email (guest_email);

ALTER TABLE loyalty_transaction
  ADD UNIQUE KEY uq_loyalty_booking_transaction (booking_id, transaction_type);
