const db = require('../config/db');
const payoutModel = require('./payoutModel');
const paymentModel = require('./paymentModel');

async function getMerchantRevenueSummary(merchantId, selectedPeriod = null) {
  await payoutModel.ensurePayoutSchema();
  const period = selectedPeriod || new Date().toISOString().slice(0, 7);
  const processorFee = paymentModel.processorFeeExpression('p');
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
                         THEN ROUND(p.amount * 0.10, 2) ELSE 0 END), 0) AS month_platform_commission,
       COALESCE(SUM(CASE WHEN DATE_FORMAT(p.paid_at, '%Y-%m') = ?
                         THEN ${processorFee} ELSE 0 END), 0) AS month_processor_fees,
       COALESCE(SUM(CASE WHEN DATE_FORMAT(p.paid_at, '%Y-%m') = ?
                         THEN COALESCE(p.dispute_fee_amount, 0) ELSE 0 END), 0) AS month_dispute_fees,
       COALESCE(SUM(CASE WHEN DATE_FORMAT(p.paid_at, '%Y-%m') = ?
                         THEN GREATEST(p.amount * 0.90 - ${processorFee} - COALESCE(p.dispute_fee_amount, 0), 0) ELSE 0 END), 0) AS month_merchant_earnings,
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
    [period, period, period, period, period, period, period, period, merchantId]
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
  await payoutModel.ensurePayoutSchema();
  const periodFilter = selectedPeriod ? "AND DATE_FORMAT(p.paid_at, '%Y-%m') = ?" : '';
  const params = selectedPeriod ? [merchantId, selectedPeriod] : [merchantId];
  const processorFee = paymentModel.processorFeeExpression('p');
  const [rows] = await db.query(
    `SELECT
       b.booking_id, b.source, b.status,
       ts.slot_date  AS booking_date,
       ts.start_time AS booking_time,
       s.service_name, s.duration_mins,
       u.full_name   AS customer_name,
       u.phone       AS customer_phone,
       u.email       AS customer_email,
       p.amount,
       ROUND(p.amount * 0.10, 2) AS platform_commission,
       ${processorFee} AS processor_fee_amount,
       COALESCE(p.dispute_fee_amount, 0) AS dispute_fee_amount,
       GREATEST(ROUND(p.amount * 0.90, 2) - ${processorFee} - COALESCE(p.dispute_fee_amount, 0), 0) AS merchant_earnings,
       p.payment_method, p.payment_status,
       p.transaction_ref, p.paid_at
     FROM booking b
     JOIN time_slot ts ON b.slot_id     = ts.slot_id
     JOIN service   s  ON b.service_id  = s.service_id
     JOIN users     u  ON b.customer_id = u.user_id
     JOIN payment p ON b.booking_id = p.booking_id AND p.payment_status = 'paid'
     WHERE b.merchant_id = ?
       ${periodFilter}
     ORDER BY ts.slot_date DESC, ts.start_time DESC, b.booking_id DESC`,
    params
  );
  return rows;
}

async function getMonthlyRevenue(merchantId) {
  await payoutModel.ensurePayoutSchema();
  const processorFee = paymentModel.processorFeeExpression('p');
  const monthKeys = [];
  const now = new Date();
  for (let i = 0; i < 6; i += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }

  const [rows] = await db.query(
    `SELECT
       DATE_FORMAT(p.paid_at, '%Y-%m')    AS month,
       COUNT(*)                           AS bookings,
       SUM(p.amount)                      AS revenue,
       SUM(ROUND(p.amount * 0.10, 2))      AS platform_commission,
       SUM(${processorFee}) AS processor_fee_amount,
       SUM(COALESCE(p.dispute_fee_amount, 0)) AS dispute_fee_amount,
       SUM(GREATEST(p.amount * 0.90 - ${processorFee} - COALESCE(p.dispute_fee_amount, 0), 0)) AS merchant_earnings
     FROM payment p
     JOIN booking b ON p.booking_id = b.booking_id
     WHERE b.merchant_id = ? AND p.payment_status = 'paid'
       AND DATE_FORMAT(p.paid_at, '%Y-%m') IN (?)
     GROUP BY DATE_FORMAT(p.paid_at, '%Y-%m')
     ORDER BY month DESC`,
    [merchantId, monthKeys]
  );

  const rowsByMonth = new Map(rows.map(row => [row.month, row]));
  return monthKeys.map(month => ({
    month,
    bookings: 0,
    revenue: 0,
    platform_commission: 0,
    processor_fee_amount: 0,
    dispute_fee_amount: 0,
    merchant_earnings: 0,
    ...(rowsByMonth.get(month) || {}),
  }));
}

module.exports = {
  getMerchantRevenueSummary,
  getTopRevenueService,
  getTopPerformingStaffThisMonth,
  getMerchantTransactions,
  getMonthlyRevenue,
};
