const db = require('../config/db');

async function getMerchantRevenueSummary(merchantId, selectedPeriod = null) {
  const period = selectedPeriod || new Date().toISOString().slice(0, 7);
  const [rows] = await db.query(
    `SELECT
       COUNT(b.booking_id)                            AS total_bookings,
       COUNT(CASE WHEN b.source='qr'       THEN 1 END) AS qr_bookings,
       COUNT(CASE WHEN b.status='completed' THEN 1 END) AS completed,
       COUNT(CASE WHEN b.status='cancelled' THEN 1 END) AS cancelled,
       COALESCE(SUM(p.amount), 0)                     AS total_revenue,
       COALESCE(SUM(CASE WHEN DATE(p.paid_at) = CURDATE() THEN p.amount ELSE 0 END), 0) AS today_revenue,
       COALESCE(SUM(CASE WHEN DATE_FORMAT(p.paid_at, '%Y-%m') = ?
                         THEN p.amount ELSE 0 END), 0) AS month_revenue,
       COALESCE(SUM(CASE WHEN DATE_FORMAT(p.paid_at, '%Y-%m') = ?
                         THEN p.amount * 0.80 ELSE 0 END), 0) AS month_merchant_earnings,
       COALESCE(AVG(CASE WHEN DATE_FORMAT(p.paid_at, '%Y-%m') = ?
                         THEN p.amount END), 0) AS month_avg_order_value,
       COUNT(CASE WHEN DATE_FORMAT(p.paid_at, '%Y-%m') = ?
                  THEN p.payment_id END) AS month_successful_payments,
       COALESCE(SUM(CASE WHEN DATE_FORMAT(p.paid_at, '%Y-%m') =
                              DATE_FORMAT(DATE_SUB(STR_TO_DATE(CONCAT(?, '-01'), '%Y-%m-%d'), INTERVAL 1 MONTH), '%Y-%m')
                         THEN p.amount ELSE 0 END), 0) AS previous_month_revenue,
       COUNT(p.payment_id)                            AS successful_payments,
       COALESCE(AVG(p.amount), 0)                     AS avg_order_value
     FROM booking b
     LEFT JOIN payment p ON b.booking_id = p.booking_id AND p.payment_status = 'paid'
     WHERE b.merchant_id = ?`,
    [period, period, period, period, period, merchantId]
  );
  return rows[0];
}

async function getTopRevenueService(merchantId, selectedPeriod) {
  const [rows] = await db.query(
    `SELECT s.service_name, COALESCE(SUM(p.amount), 0) AS revenue
     FROM payment p
     JOIN booking b ON b.booking_id = p.booking_id
     JOIN service s ON s.service_id = b.service_id
     WHERE b.merchant_id = ?
       AND p.payment_status = 'paid'
       AND DATE_FORMAT(p.paid_at, '%Y-%m') = ?
     GROUP BY s.service_id, s.service_name
     ORDER BY revenue DESC, s.service_name ASC
     LIMIT 1`,
    [merchantId, selectedPeriod]
  );
  return rows[0] || null;
}

// Highlights the staff member delivering the most completed work this month.
async function getTopPerformingStaffThisMonth(merchantId, periodStart) {
  const [rows] = await db.query(
     `SELECT st.staff_id, st.full_name, st.role,
            COUNT(DISTINCT CASE WHEN b.status = 'completed' THEN b.booking_id END) AS completed_bookings,
            COALESCE(SUM(CASE WHEN b.status = 'completed' AND p.payment_status = 'paid' THEN p.amount ELSE 0 END), 0) AS revenue
     FROM staff st
     JOIN booking b ON b.staff_id = st.staff_id
     JOIN time_slot ts ON ts.slot_id = b.slot_id
     LEFT JOIN payment p ON p.booking_id = b.booking_id
     WHERE st.merchant_id = ?
       AND ts.slot_date >= ?
       AND ts.slot_date < DATE_ADD(?, INTERVAL 1 MONTH)
     GROUP BY st.staff_id, st.full_name, st.role
     HAVING completed_bookings > 0
     ORDER BY completed_bookings DESC, revenue DESC
     LIMIT 1`,
    [merchantId, periodStart, periodStart]
  );
  return rows[0] || null;
}

async function getMerchantTransactions(merchantId, selectedPeriod = null) {
  const periodFilter = selectedPeriod ? "AND DATE_FORMAT(p.paid_at, '%Y-%m') = ?" : '';
  const params = selectedPeriod ? [merchantId, selectedPeriod] : [merchantId];
  const [rows] = await db.query(
    `SELECT
       b.booking_id, b.source, b.status,
       ts.slot_date  AS booking_date,
       ts.start_time AS booking_time,
       s.service_name, s.duration_mins,
       u.full_name   AS customer_name,
       u.phone       AS customer_phone,
       u.email       AS customer_email,
       p.amount, ROUND(p.amount * 0.80, 2) AS merchant_earnings,
       p.payment_method, p.payment_status,
       p.transaction_ref, p.paid_at
     FROM booking b
     JOIN time_slot ts ON b.slot_id     = ts.slot_id
     JOIN service   s  ON b.service_id  = s.service_id
     JOIN users     u  ON b.customer_id = u.user_id
     LEFT JOIN payment p ON b.booking_id = p.booking_id
     WHERE b.merchant_id = ?
       ${periodFilter}
     ORDER BY b.created_at DESC`,
    params
  );
  return rows;
}

async function getMonthlyRevenue(merchantId) {
  const [rows] = await db.query(
    `SELECT
       DATE_FORMAT(p.paid_at, '%Y-%m')    AS month,
       COUNT(*)                           AS bookings,
       SUM(p.amount)                      AS revenue,
       SUM(p.amount * 0.80)               AS merchant_earnings
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

module.exports = {
  getMerchantRevenueSummary,
  getTopRevenueService,
  getTopPerformingStaffThisMonth,
  getMerchantTransactions,
  getMonthlyRevenue,
};
