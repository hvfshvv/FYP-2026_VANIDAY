const db = require('../config/db');

async function getMerchantRevenueSummary(merchantId) {
  const [rows] = await db.query(
    `SELECT
       COUNT(b.booking_id)                          AS total_bookings,
       COUNT(CASE WHEN b.source='qr_scan' THEN 1 END) AS qr_bookings,
       COUNT(CASE WHEN b.status='completed' THEN 1 END) AS completed,
       COUNT(CASE WHEN b.status='cancelled' THEN 1 END) AS cancelled,
       COALESCE(SUM(p.amount), 0)                   AS total_revenue,
       COALESCE(SUM(p.uniday_share), 0)            AS total_uniday_share,
       COALESCE(SUM(p.merchant_share), 0)           AS total_merchant_share,
       COALESCE(AVG(p.amount), 0)                   AS avg_order_value
     FROM BOOKING b
     LEFT JOIN PAYMENT p ON b.booking_id = p.booking_id AND p.payment_status = 'success'
     WHERE b.merchant_id = ?`,
    [merchantId]
  );
  return rows[0];
}

async function getMerchantTransactions(merchantId) {
  const [rows] = await db.query(
    `SELECT
       b.booking_id, b.booking_date, b.booking_time, b.source, b.status,
       s.service_name, s.duration_mins,
       u.full_name AS customer_name, u.phone AS customer_phone, u.email AS customer_email,
       p.amount, p.payment_method, p.payment_status, p.commission_pct,
       p.uniday_share, p.merchant_share, p.transaction_ref, p.paid_at
     FROM BOOKING b
     JOIN SERVICE s ON b.service_id  = s.service_id
     JOIN USERS   u ON b.customer_id = u.user_id
     LEFT JOIN PAYMENT p ON b.booking_id = p.booking_id
     WHERE b.merchant_id = ?
     ORDER BY b.created_at DESC`,
    [merchantId]
  );
  return rows;
}

async function getMonthlyRevenue(merchantId) {
  const [rows] = await db.query(
    `SELECT
       DATE_FORMAT(p.paid_at, '%Y-%m') AS month,
       COUNT(*)                        AS bookings,
       SUM(p.amount)                   AS revenue,
       SUM(p.merchant_share)           AS net_earnings
     FROM PAYMENT p
     JOIN BOOKING b ON p.booking_id = b.booking_id
     WHERE b.merchant_id = ? AND p.payment_status = 'success'
     GROUP BY DATE_FORMAT(p.paid_at, '%Y-%m')
     ORDER BY month DESC
     LIMIT 6`,
    [merchantId]
  );
  return rows;
}

module.exports = { getMerchantRevenueSummary, getMerchantTransactions, getMonthlyRevenue };
