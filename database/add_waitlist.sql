CREATE TABLE IF NOT EXISTS waitlist (
  waitlist_id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  merchant_id INT NOT NULL,
  service_id INT NOT NULL,
  booking_date DATE NOT NULL,
  booking_time TIME NOT NULL,
  status ENUM('waiting','offered','expired','confirmed','cancelled','removed') NOT NULL DEFAULT 'waiting',
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  offered_at DATETIME NULL,
  offer_expires_at DATETIME NULL,
  confirmed_booking_id INT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_waitlist_slot_status (merchant_id, service_id, booking_date, booking_time, status, joined_at),
  INDEX idx_waitlist_customer_status (customer_id, status, joined_at),
  INDEX idx_waitlist_offer_expiry (status, offer_expires_at),
  CONSTRAINT fk_waitlist_customer
    FOREIGN KEY (customer_id) REFERENCES users(user_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_waitlist_merchant
    FOREIGN KEY (merchant_id) REFERENCES merchant(merchant_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_waitlist_service
    FOREIGN KEY (service_id) REFERENCES service(service_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_waitlist_confirmed_booking
    FOREIGN KEY (confirmed_booking_id) REFERENCES booking(booking_id)
    ON DELETE SET NULL
);
