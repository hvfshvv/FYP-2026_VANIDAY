-- Unified wallet, transactions, reviews, and merchant cancellation policy.
-- Safe rollout phase: copies data but intentionally does not drop legacy tables.
-- Select the intended schema as default before running this file manually.

-- MySQL does not consistently support ADD COLUMN IF NOT EXISTS, so each
-- conditional change is built from INFORMATION_SCHEMA and executed safely.
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merchant' AND COLUMN_NAME = 'min_cancel_hours') = 0,
  'ALTER TABLE merchant ADD COLUMN min_cancel_hours INT NOT NULL DEFAULT 6', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merchant' AND COLUMN_NAME = 'refund_percentage') = 0,
  'ALTER TABLE merchant ADD COLUMN refund_percentage DECIMAL(5,2) NOT NULL DEFAULT 100.00', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merchant' AND COLUMN_NAME = 'allow_reschedule') = 0,
  'ALTER TABLE merchant ADD COLUMN allow_reschedule BOOLEAN NOT NULL DEFAULT TRUE', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merchant' AND COLUMN_NAME = 'cancellation_policy_active') = 0,
  'ALTER TABLE merchant ADD COLUMN cancellation_policy_active BOOLEAN NOT NULL DEFAULT TRUE', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE merchant m
JOIN cancellation_policy cp ON cp.merchant_id = m.merchant_id
SET m.min_cancel_hours = cp.min_cancel_hours,
    m.refund_percentage = cp.refund_percentage,
    m.allow_reschedule = cp.allow_reschedule,
    m.cancellation_policy_active = cp.is_active;

CREATE TABLE IF NOT EXISTS wallet (
  wallet_id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL UNIQUE,
  money_balance DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  currency CHAR(3) NOT NULL DEFAULT 'sgd',
  lifetime_topup DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  lifetime_spent DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  points_balance INT NOT NULL DEFAULT 0,
  lifetime_points_earned INT NOT NULL DEFAULT 0,
  lifetime_points_redeemed INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_wallet_customer FOREIGN KEY (customer_id) REFERENCES users(user_id),
  CONSTRAINT chk_wallet_money_balance CHECK (money_balance >= 0),
  CONSTRAINT chk_wallet_points_balance CHECK (points_balance >= 0)
);

INSERT INTO wallet
  (customer_id, money_balance, currency, lifetime_topup, lifetime_spent,
   points_balance, lifetime_points_earned, lifetime_points_redeemed, created_at, updated_at)
SELECT u.user_id,
       COALESCE(pw.balance, 0), COALESCE(pw.currency, 'sgd'),
       COALESCE(pw.lifetime_topup, 0), COALESCE(pw.lifetime_spent, 0),
       COALESCE(lw.points_balance, 0), COALESCE(lw.lifetime_points_earned, 0),
       COALESCE(lw.lifetime_points_redeemed, 0),
       COALESCE(pw.created_at, CURRENT_TIMESTAMP),
       GREATEST(COALESCE(pw.updated_at, '1970-01-01'), COALESCE(lw.updated_at, '1970-01-01'))
FROM users u
LEFT JOIN payment_wallet pw ON pw.customer_id = u.user_id
LEFT JOIN loyalty_wallet lw ON lw.customer_id = u.user_id
WHERE u.role = 'customer' AND (pw.wallet_id IS NOT NULL OR lw.wallet_id IS NOT NULL)
ON DUPLICATE KEY UPDATE
  money_balance = VALUES(money_balance), currency = VALUES(currency),
  lifetime_topup = VALUES(lifetime_topup), lifetime_spent = VALUES(lifetime_spent),
  points_balance = VALUES(points_balance),
  lifetime_points_earned = VALUES(lifetime_points_earned),
  lifetime_points_redeemed = VALUES(lifetime_points_redeemed);

CREATE TABLE IF NOT EXISTS transactions (
  transaction_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  wallet_id INT NOT NULL,
  booking_id INT NULL,
  asset_type ENUM('money','points') NOT NULL,
  transaction_type ENUM('topup','payment','refund','bonus','earn_points','redeem_points','review_bonus','adjustment') NOT NULL,
  amount DECIMAL(10,2) NULL,
  points_amount INT NULL,
  status ENUM('pending','completed','failed') NOT NULL DEFAULT 'completed',
  payment_method ENUM('stripe','paynow','wallet','system') NULL,
  external_reference VARCHAR(255) NULL,
  idempotency_key VARCHAR(255) NULL,
  description VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  CONSTRAINT fk_transactions_wallet FOREIGN KEY (wallet_id) REFERENCES wallet(wallet_id),
  CONSTRAINT fk_transactions_booking FOREIGN KEY (booking_id) REFERENCES booking(booking_id),
  CONSTRAINT chk_transactions_amount CHECK (
    (asset_type = 'money' AND amount IS NOT NULL AND points_amount IS NULL) OR
    (asset_type = 'points' AND points_amount IS NOT NULL AND amount IS NULL)
  ),
  UNIQUE KEY uq_transactions_idempotency (idempotency_key),
  KEY idx_transactions_wallet_created (wallet_id, created_at),
  KEY idx_transactions_booking (booking_id)
);

INSERT IGNORE INTO transactions
  (wallet_id, booking_id, asset_type, transaction_type, amount, status, payment_method,
   external_reference, idempotency_key, description, created_at, completed_at)
SELECT w.wallet_id, wt.booking_id, 'money', wt.transaction_type, wt.amount, wt.status,
       wt.payment_method, wt.external_reference, wt.idempotency_key, wt.description,
       wt.created_at, wt.completed_at
FROM wallet_transaction wt
JOIN payment_wallet pw ON pw.wallet_id = wt.wallet_id
JOIN wallet w ON w.customer_id = pw.customer_id;

INSERT IGNORE INTO transactions
  (wallet_id, booking_id, asset_type, transaction_type, points_amount, status,
   idempotency_key, description, created_at, completed_at)
SELECT w.wallet_id, lt.booking_id, 'points', lt.transaction_type, lt.points_amount,
       'completed', CONCAT('legacy-loyalty:', lt.loyalty_transaction_id),
       lt.description, lt.created_at, lt.created_at
FROM loyalty_transaction lt
JOIN loyalty_wallet lw ON lw.wallet_id = lt.wallet_id
JOIN wallet w ON w.customer_id = lw.customer_id
WHERE lt.transaction_type IN ('earn_points', 'redeem_points');

-- Preserve the verified current balance and rebuild lifetime redemption totals.
-- Some legacy positive point history is incomplete, while recorded negative
-- redemption entries are authoritative.
UPDATE wallet w
LEFT JOIN (
  SELECT wallet_id,
         COALESCE(SUM(CASE WHEN points_amount < 0 THEN ABS(points_amount) ELSE 0 END), 0) AS redeemed
  FROM transactions
  WHERE asset_type = 'points' AND status = 'completed'
  GROUP BY wallet_id
) totals ON totals.wallet_id = w.wallet_id
SET w.lifetime_points_redeemed = COALESCE(totals.redeemed, 0),
    w.lifetime_points_earned = w.points_balance + COALESCE(totals.redeemed, 0);

CREATE TABLE IF NOT EXISTS reviews (
  review_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  customer_id INT NOT NULL,
  review_target ENUM('merchant','platform') NOT NULL,
  merchant_id INT NULL,
  service_id INT NULL,
  staff_id INT NULL,
  rating INT NOT NULL,
  feedback_type ENUM('booking_experience','payment','qr_checkin','whatsapp','general') NULL,
  review_text TEXT NULL,
  review_image_data LONGBLOB NULL,
  review_image_mime VARCHAR(50) NULL,
  merchant_reply TEXT NULL,
  merchant_replied_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reviews_booking FOREIGN KEY (booking_id) REFERENCES booking(booking_id),
  CONSTRAINT fk_reviews_customer FOREIGN KEY (customer_id) REFERENCES users(user_id),
  CONSTRAINT fk_reviews_merchant FOREIGN KEY (merchant_id) REFERENCES merchant(merchant_id),
  CONSTRAINT fk_reviews_service FOREIGN KEY (service_id) REFERENCES service(service_id),
  CONSTRAINT fk_reviews_staff FOREIGN KEY (staff_id) REFERENCES staff(staff_id),
  CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT chk_reviews_target_fields CHECK (
    (review_target = 'merchant' AND merchant_id IS NOT NULL AND service_id IS NOT NULL AND feedback_type IS NULL) OR
    (review_target = 'platform' AND merchant_id IS NULL AND service_id IS NULL AND staff_id IS NULL
      AND feedback_type IS NOT NULL AND merchant_reply IS NULL AND merchant_replied_at IS NULL)
  ),
  UNIQUE KEY uq_reviews_booking_target (booking_id, review_target),
  KEY idx_reviews_merchant_target (merchant_id, review_target),
  KEY idx_reviews_customer (customer_id)
);

SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merchant_review' AND COLUMN_NAME = 'review_image_data') = 0,
  'ALTER TABLE merchant_review ADD COLUMN review_image_data LONGBLOB NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merchant_review' AND COLUMN_NAME = 'review_image_mime') = 0,
  'ALTER TABLE merchant_review ADD COLUMN review_image_mime VARCHAR(50) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merchant_review' AND COLUMN_NAME = 'merchant_reply') = 0,
  'ALTER TABLE merchant_review ADD COLUMN merchant_reply TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merchant_review' AND COLUMN_NAME = 'merchant_replied_at') = 0,
  'ALTER TABLE merchant_review ADD COLUMN merchant_replied_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO reviews
  (booking_id, customer_id, review_target, merchant_id, service_id, staff_id, rating,
   review_text, review_image_data, review_image_mime, merchant_reply, merchant_replied_at, created_at)
SELECT booking_id, customer_id, 'merchant', merchant_id, service_id, staff_id, rating,
       review_text, review_image_data, review_image_mime, merchant_reply, merchant_replied_at, created_at
FROM merchant_review;

INSERT IGNORE INTO reviews
  (booking_id, customer_id, review_target, rating, feedback_type, review_text, created_at)
SELECT booking_id, customer_id, 'platform', rating, feedback_type, feedback_text, created_at
FROM platform_feedback
WHERE booking_id IS NOT NULL;
