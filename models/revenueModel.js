const db = require('../config/db');

async function getMerchantRevenueSummary(merchantId) {
  const [rows] = await db.query(
    `SELECT
       COUNT(b.booking_id)                            AS total_bookings,
       COUNT(CASE WHEN b.source='qr'       THEN 1 END) AS qr_bookings,
       COUNT(CASE WHEN b.status='completed' THEN 1 END) AS completed,
       COUNT(CASE WHEN b.status='cancelled' THEN 1 END) AS cancelled,
       COALESCE(SUM(p.amount), 0)                     AS total_revenue,
       COALESCE(SUM(p.amount * 0.20), 0)              AS total_uniday_share,
       COALESCE(SUM(p.amount * 0.80), 0)              AS total_merchant_share,
       COALESCE(AVG(p.amount), 0)                     AS avg_order_value
     FROM booking b
     LEFT JOIN payment p ON b.booking_id = p.booking_id AND p.payment_status = 'paid'
     WHERE b.merchant_id = ?`,
    [merchantId]
  );
  return rows[0];
}

async function getMerchantTransactions(merchantId) {
  const [rows] = await db.query(
    `SELECT
       b.booking_id, b.source, b.status,
       ts.slot_date  AS booking_date,
       ts.start_time AS booking_time,
       s.service_name, s.duration_mins,
       u.full_name   AS customer_name,
       u.phone       AS customer_phone,
       u.email       AS customer_email,
       p.amount, p.payment_method, p.payment_status,
       ROUND(p.amount * 0.20, 2) AS uniday_share,
       ROUND(p.amount * 0.80, 2) AS merchant_share,
       p.transaction_ref, p.paid_at
     FROM booking b
     JOIN time_slot ts ON b.slot_id     = ts.slot_id
     JOIN service   s  ON b.service_id  = s.service_id
     JOIN users     u  ON b.customer_id = u.user_id
     LEFT JOIN payment p ON b.booking_id = p.booking_id
     WHERE b.merchant_id = ?
     ORDER BY b.created_at DESC`,
    [merchantId]
  );
  return rows;
}

async function getMonthlyRevenue(merchantId) {
  const [rows] = await db.query(
    `SELECT
       DATE_FORMAT(p.paid_at, '%Y-%m')    AS month,
       COUNT(*)                           AS bookings,
       SUM(p.amount)                      AS revenue,
       SUM(p.amount * 0.80)               AS net_earnings
     FROM payment p
     JOIN booking b ON p.booking_id = b.booking_id
     WHERE b.merchant_id = ? AND p.payment_status = 'paid'
     GROUP BY DATE_FORMAT(p.paid_at, '%Y-%m')
     ORDER BY month DESC
     LIMIT 6`,
    [merchantId]
  );
  return rows;
}

module.exports = { getMerchantRevenueSummary, getMerchantTransactions, getMonthlyRevenue };
