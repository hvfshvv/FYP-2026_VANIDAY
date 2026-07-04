-- Stored-value payment wallet. Loyalty points remain in loyalty_wallet.
CREATE TABLE IF NOT EXISTS payment_wallet (
  wallet_id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL UNIQUE,
  balance DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(3) NOT NULL DEFAULT 'sgd',
  lifetime_topup DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  lifetime_spent DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_wallet_customer FOREIGN KEY (customer_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS wallet_transaction (
  wallet_transaction_id INT AUTO_INCREMENT PRIMARY KEY,
  wallet_id INT NOT NULL,
  booking_id INT NULL,
  transaction_type ENUM('topup','payment','refund','bonus') NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('pending','completed','failed') NOT NULL DEFAULT 'pending',
  payment_method ENUM('stripe','paynow','wallet','system') NULL,
  external_reference VARCHAR(255) NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  description VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  UNIQUE KEY uq_wallet_transaction_idempotency (idempotency_key),
  KEY idx_wallet_transaction_wallet_created (wallet_id, created_at),
  KEY idx_wallet_transaction_booking (booking_id),
  CONSTRAINT fk_wallet_transaction_wallet FOREIGN KEY (wallet_id) REFERENCES payment_wallet(wallet_id),
  CONSTRAINT fk_wallet_transaction_booking FOREIGN KEY (booking_id) REFERENCES booking(booking_id)
);
