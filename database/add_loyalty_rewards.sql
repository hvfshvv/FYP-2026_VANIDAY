-- Re-runnable. Adds admin-managed loyalty reward vouchers.
CREATE TABLE IF NOT EXISTS loyalty_reward (
  reward_id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  description TEXT,
  points_cost INT NOT NULL,
  min_tier ENUM('Bronze','Silver','Gold','Platinum') NOT NULL DEFAULT 'Bronze',
  value_label VARCHAR(50),
  discount_type ENUM('percent','fixed_amount') NOT NULL,
  discount_value DECIMAL(10,2) NOT NULL,
  min_spend DECIMAL(10,2) NULL,
  validity_months INT NOT NULL DEFAULT 3,
  is_active BOOLEAN DEFAULT TRUE,
  display_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO loyalty_reward
  (title, description, points_cost, min_tier, value_label, discount_type,
   discount_value, min_spend, validity_months, is_active, display_order)
SELECT 'S$5 Beauty Voucher', 'Use this on your next paid booking.', 50, 'Bronze',
       'S$5 off', 'fixed_amount', 5.00, NULL, 3, 1, 10
WHERE NOT EXISTS (
  SELECT 1 FROM loyalty_reward
  WHERE title = 'S$5 Beauty Voucher' AND points_cost = 50
);

INSERT INTO loyalty_reward
  (title, description, points_cost, min_tier, value_label, discount_type,
   discount_value, min_spend, validity_months, is_active, display_order)
SELECT '10% Self-care Voucher', 'A starter reward for regular members.', 80, 'Bronze',
       '10% off', 'percent', 10.00, NULL, 3, 1, 20
WHERE NOT EXISTS (
  SELECT 1 FROM loyalty_reward
  WHERE title = '10% Self-care Voucher' AND points_cost = 80
);

INSERT INTO loyalty_reward
  (title, description, points_cost, min_tier, value_label, discount_type,
   discount_value, min_spend, validity_months, is_active, display_order)
SELECT 'S$12 Silver Treat', 'A stronger voucher unlocked at Silver tier.', 110, 'Silver',
       'S$12 off', 'fixed_amount', 12.00, NULL, 3, 1, 30
WHERE NOT EXISTS (
  SELECT 1 FROM loyalty_reward
  WHERE title = 'S$12 Silver Treat' AND points_cost = 110
);

INSERT INTO loyalty_reward
  (title, description, points_cost, min_tier, value_label, discount_type,
   discount_value, min_spend, validity_months, is_active, display_order)
SELECT 'S$25 Gold Glow Voucher', 'A premium voucher for Gold members and above.', 220, 'Gold',
       'S$25 off', 'fixed_amount', 25.00, NULL, 3, 1, 40
WHERE NOT EXISTS (
  SELECT 1 FROM loyalty_reward
  WHERE title = 'S$25 Gold Glow Voucher' AND points_cost = 220
);

INSERT INTO loyalty_reward
  (title, description, points_cost, min_tier, value_label, discount_type,
   discount_value, min_spend, validity_months, is_active, display_order)
SELECT 'S$40 Platinum Privilege', 'The top loyalty voucher for the biggest fans.', 350, 'Platinum',
       'S$40 off', 'fixed_amount', 40.00, NULL, 3, 1, 50
WHERE NOT EXISTS (
  SELECT 1 FROM loyalty_reward
  WHERE title = 'S$40 Platinum Privilege' AND points_cost = 350
);
