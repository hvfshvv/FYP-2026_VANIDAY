const db = require('../config/db');

async function getDashboardSummary() {
  const [rows] = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE role = 'customer') AS total_customers,
      (SELECT COUNT(*) FROM merchant) AS total_merchants,
      (SELECT COUNT(*) FROM booking) AS total_bookings,
      (SELECT COALESCE(SUM(amount), 0) FROM payment WHERE payment_status = 'paid') AS total_revenue,
      (SELECT COUNT(*) FROM payment) AS total_payments,
      (SELECT COUNT(*) FROM service) AS total_services,
      (SELECT COUNT(*) FROM promotion) AS total_promotions,
      (SELECT COUNT(*) FROM validation_log) AS total_validation_errors
  `);

  return rows[0] || {};
}

async function getRecentBookings(limit = 8) {
  const [rows] = await db.query(
    `SELECT
       b.booking_id,
       b.status,
       b.source,
       b.total_amount,
       b.created_at,
       ts.slot_date,
       ts.start_time,
       u.full_name AS customer_name,
       m.merchant_name,
       s.service_name
     FROM booking b
     JOIN users u ON b.customer_id = u.user_id
     JOIN merchant m ON b.merchant_id = m.merchant_id
     JOIN service s ON b.service_id = s.service_id
     LEFT JOIN time_slot ts ON b.slot_id = ts.slot_id
     ORDER BY b.created_at DESC
     LIMIT ?`,
    [limit]
  );

  return rows;
}

async function getRecentPayments(limit = 8) {
  const [rows] = await db.query(
    `SELECT
       p.payment_id,
       p.booking_id,
       p.amount,
       p.payment_method,
       p.payment_status,
       p.transaction_ref,
       p.paid_at,
       u.full_name AS customer_name,
       m.merchant_name
     FROM payment p
     LEFT JOIN booking b ON p.booking_id = b.booking_id
     LEFT JOIN users u ON b.customer_id = u.user_id
     LEFT JOIN merchant m ON b.merchant_id = m.merchant_id
     ORDER BY COALESCE(p.paid_at, '1970-01-01') DESC, p.payment_id DESC
     LIMIT ?`,
    [limit]
  );

  return rows;
}

async function getRecentValidationErrors(limit = 8) {
  const [rows] = await db.query(
    `SELECT
       log_id,
       user_id,
       booking_id,
       module,
       error_type,
       error_message,
       is_resolved,
       created_at
     FROM validation_log
     ORDER BY created_at DESC
     LIMIT ?`,
    [limit]
  );

  return rows;
}

module.exports = {
  getDashboardSummary,
  getRecentBookings,
  getRecentPayments,
  getRecentValidationErrors,
};
