-- Run after database/consolidate_schema.sql and before deleting legacy tables.
-- old_* and new_* values must match; both cashback values must be zero.
-- Select the intended schema as default before running this file manually.

SELECT
  (SELECT COUNT(*) FROM (
     SELECT customer_id FROM payment_wallet
     UNION
     SELECT customer_id FROM loyalty_wallet
   ) legacy_wallet_customers) AS old_wallet_customers,
  (SELECT COUNT(*) FROM wallet) AS new_wallet_customers,
  (SELECT COALESCE(SUM(balance), 0) FROM payment_wallet) AS old_money_balance,
  (SELECT COALESCE(SUM(money_balance), 0) FROM wallet) AS new_money_balance,
  (SELECT COALESCE(SUM(points_balance), 0) FROM loyalty_wallet) AS old_points_balance,
  (SELECT COALESCE(SUM(points_balance), 0) FROM wallet) AS new_points_balance,
  (SELECT COUNT(*) FROM merchant_review) AS old_merchant_reviews,
  (SELECT COUNT(*) FROM reviews WHERE review_target = 'merchant') AS new_merchant_reviews,
  (SELECT COUNT(*) FROM platform_feedback WHERE booking_id IS NOT NULL) AS old_platform_reviews,
  (SELECT COUNT(*) FROM reviews WHERE review_target = 'platform') AS new_platform_reviews,
  (SELECT COUNT(*) FROM wallet_transaction) AS old_money_transactions,
  (SELECT COUNT(*) FROM transactions WHERE asset_type = 'money') AS new_money_transactions,
  (SELECT COUNT(*) FROM loyalty_transaction WHERE transaction_type IN ('earn_points','redeem_points')) AS old_point_transactions,
  (SELECT COUNT(*) FROM transactions WHERE asset_type = 'points') AS new_point_transactions,
  (SELECT COUNT(*) FROM loyalty_wallet WHERE cashback_balance <> 0) AS nonzero_cashback_wallets,
  (SELECT COUNT(*) FROM loyalty_transaction
    WHERE transaction_type IN ('earn_cashback','use_cashback','refund_cashback')) AS cashback_transactions;
