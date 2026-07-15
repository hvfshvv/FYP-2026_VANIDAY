-- One-time correction for databases that already ran consolidate_schema.sql.
-- Restores lifetime counters while preserving the verified current balance.
-- Legacy positive point history is incomplete for some customers, but recorded
-- negative redemption entries are authoritative.
-- Select the intended schema as default before running this file manually.

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

SELECT w.customer_id, w.points_balance, w.lifetime_points_earned,
       w.lifetime_points_redeemed,
       w.lifetime_points_earned - w.lifetime_points_redeemed AS ledger_balance
FROM wallet w
ORDER BY w.customer_id;
