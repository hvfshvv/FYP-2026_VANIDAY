/*
 * adminDashboardModel.js
 * Provides aggregate data for the admin dashboard home page: platform-wide
 * summary counts, revenue report, recent activity feeds, and merchant
 * application trend data used in dashboard charts.
 */

const db = require('../config/db');
const reviewModel = require('./reviewModel');
const payoutModel = require('./payoutModel');

const merchantSettlementSql = `
  COALESCE(SUM(
    CASE WHEN p.payment_status = 'paid'
      THEN GREATEST(p.amount * 0.90 - COALESCE(p.processor_fee_amount, 0) - COALESCE(p.dispute_fee_amount, 0), 0)
      ELSE 0
    END
  ), 0)
`;

function maskSettlementAmount(value) {
  const amount = Number(value || 0);
  if (amount <= 0) return 'S$0';
  if (amount < 100) return 'S$XX';
  return `S$${Math.floor(amount / 100)}XX`;
}

// ── DASHBOARD SUMMARY ──────────────────────────────────────────────────────

// Returns platform-wide KPI counts for the admin dashboard home cards.
async function getDashboardSummary() {
  await reviewModel.ensureReviewSchema();
  const [rows] = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE role = 'customer') AS total_customers,
      (SELECT COUNT(*) FROM merchant) AS total_merchants,
      (SELECT COUNT(*) FROM booking) AS total_bookings,
      (SELECT COALESCE(SUM(amount), 0) FROM payment WHERE payment_status = 'paid') AS total_revenue,
      (SELECT COUNT(*) FROM payment) AS total_payments,
      (SELECT COUNT(*) FROM service) AS total_services,
      (SELECT COUNT(*) FROM promotion) AS total_promotions,
      (SELECT COUNT(*) FROM promotion WHERE approval_status = 'pending') AS pending_promotion_approvals,
      (SELECT COUNT(*) FROM merchant WHERE verification_status = 'pending') AS pending_merchant_validations,
      (SELECT COUNT(*) FROM validation_log WHERE is_resolved = FALSE) AS total_validation_errors
      ,(SELECT COUNT(*) FROM reviews WHERE review_target = 'merchant' AND removal_request_status = 'pending') AS pending_review_requests
  `);

  return rows[0] || {};
}

// ── REVENUE REPORT ─────────────────────────────────────────────────────────

// Builds the full revenue report for a date range: overview, monthly trend, category breakdown, and more.
async function getPlatformRevenueReport({ startDate, endDate } = {}) {
  await payoutModel.ensurePayoutSchema();
  const paymentDateFilter = 'DATE(COALESCE(p.paid_at, b.created_at)) BETWEEN ? AND ?';
  const rangeParams = [startDate, endDate];

  const [
    [overviewRows],
    [monthly],
    [categoryBreakdown],
    [topMerchants],
    [paymentStatus],
    [bookingSource],
    [recentTransactions],
  ] = await Promise.all([
    db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN p.payment_status = 'paid' THEN p.amount ELSE 0 END), 0) AS gross_revenue,
         COALESCE(SUM(CASE WHEN p.payment_status = 'paid' THEN p.amount * 0.10 ELSE 0 END), 0) AS platform_commission,
         ${merchantSettlementSql} AS merchant_settlement_private,
         COUNT(DISTINCT CASE WHEN p.payment_status = 'paid' THEN b.booking_id END) AS paid_bookings,
         COUNT(DISTINCT b.merchant_id) AS merchants_with_payments,
         COALESCE(AVG(CASE WHEN p.payment_status = 'paid' THEN p.amount END), 0) AS average_order_value,
         SUM(CASE WHEN p.payment_status = 'paid' THEN 1 ELSE 0 END) AS paid_payments,
         SUM(CASE WHEN p.payment_status IN ('failed', 'payment_failed') THEN 1 ELSE 0 END) AS failed_payments
       FROM payment p
       JOIN booking b ON b.booking_id = p.booking_id
       WHERE ${paymentDateFilter}`,
      rangeParams
    ),
    // Monthly revenue breakdown for the trend chart.
    db.query(
      `SELECT
         DATE_FORMAT(COALESCE(p.paid_at, b.created_at), '%Y-%m') AS month,
         COUNT(DISTINCT b.booking_id) AS paid_bookings,
         COALESCE(SUM(p.amount), 0) AS gross_revenue,
         COALESCE(SUM(p.amount * 0.10), 0) AS platform_commission,
         ${merchantSettlementSql} AS merchant_settlement_private
       FROM payment p
       JOIN booking b ON b.booking_id = p.booking_id
       WHERE p.payment_status = 'paid' AND ${paymentDateFilter}
       GROUP BY DATE_FORMAT(COALESCE(p.paid_at, b.created_at), '%Y-%m')
       ORDER BY month DESC
       LIMIT 6`,
      rangeParams
    ),
    // Revenue split by service/merchant category for the pie chart.
    db.query(
      `SELECT
         COALESCE(NULLIF(s.category, ''), NULLIF(m.category, ''), 'Uncategorised') AS category,
         COUNT(DISTINCT b.booking_id) AS paid_bookings,
         COALESCE(SUM(p.amount), 0) AS gross_revenue,
         COALESCE(SUM(p.amount * 0.10), 0) AS platform_commission
       FROM payment p
       JOIN booking b ON b.booking_id = p.booking_id
       JOIN merchant m ON m.merchant_id = b.merchant_id
       JOIN service s ON s.service_id = b.service_id
       WHERE p.payment_status = 'paid' AND ${paymentDateFilter}
       GROUP BY COALESCE(NULLIF(s.category, ''), NULLIF(m.category, ''), 'Uncategorised')
       ORDER BY gross_revenue DESC`,
      rangeParams
    ),
    // Top 10 revenue-generating merchants in the period.
    db.query(
      `SELECT
         m.merchant_id,
         m.merchant_name,
         COALESCE(NULLIF(m.category, ''), 'Uncategorised') AS category,
         COUNT(DISTINCT b.booking_id) AS paid_bookings,
         COALESCE(SUM(p.amount), 0) AS gross_revenue,
         COALESCE(SUM(p.amount * 0.10), 0) AS platform_commission,
         ${merchantSettlementSql} AS merchant_settlement_private
       FROM payment p
       JOIN booking b ON b.booking_id = p.booking_id
       JOIN merchant m ON m.merchant_id = b.merchant_id
       WHERE p.payment_status = 'paid' AND ${paymentDateFilter}
       GROUP BY m.merchant_id, m.merchant_name, m.category
       ORDER BY gross_revenue DESC
       LIMIT 10`,
      rangeParams
    ),
    db.query(
      `SELECT
         COALESCE(p.payment_status, 'unknown') AS payment_status,
         COUNT(*) AS total,
         COALESCE(SUM(p.amount), 0) AS amount
       FROM payment p
       JOIN booking b ON b.booking_id = p.booking_id
       WHERE ${paymentDateFilter}
       GROUP BY COALESCE(p.payment_status, 'unknown')
       ORDER BY total DESC`,
      rangeParams
    ),
    db.query(
      `SELECT
         COALESCE(NULLIF(b.source, ''), 'web') AS source,
         COUNT(DISTINCT b.booking_id) AS paid_bookings,
         COALESCE(SUM(p.amount), 0) AS gross_revenue
       FROM payment p
       JOIN booking b ON b.booking_id = p.booking_id
       WHERE p.payment_status = 'paid' AND ${paymentDateFilter}
       GROUP BY COALESCE(NULLIF(b.source, ''), 'web')
       ORDER BY gross_revenue DESC`,
      rangeParams
    ),
    db.query(
      `SELECT
         p.payment_id,
         p.booking_id,
         p.amount,
         p.payment_status,
         p.payment_method,
         p.transaction_ref,
         p.paid_at,
         b.source,
         COALESCE(u.full_name, b.guest_name, 'Guest') AS customer_name,
         m.merchant_name,
         s.service_name
       FROM payment p
       JOIN booking b ON b.booking_id = p.booking_id
       JOIN merchant m ON m.merchant_id = b.merchant_id
       JOIN service s ON s.service_id = b.service_id
       LEFT JOIN users u ON u.user_id = b.customer_id
       WHERE ${paymentDateFilter}
       ORDER BY COALESCE(p.paid_at, b.created_at) DESC, p.payment_id DESC
       LIMIT 12`,
      rangeParams
    ),
  ]);

  const overview = overviewRows[0] || {};
  overview.merchant_settlement_band = maskSettlementAmount(overview.merchant_settlement_private);
  delete overview.merchant_settlement_private;

  const monthlyMasked = monthly.map(row => {
    const { merchant_settlement_private: privateAmount, ...publicRow } = row;
    return {
      ...publicRow,
      merchant_settlement_band: maskSettlementAmount(privateAmount),
    };
  });

  const topMerchantsMasked = topMerchants.map(row => {
    const { merchant_settlement_private: privateAmount, ...publicRow } = row;
    return {
      ...publicRow,
      merchant_settlement_band: maskSettlementAmount(privateAmount),
    };
  });

  return {
    overview,
    monthly: monthlyMasked,
    categoryBreakdown,
    topMerchants: topMerchantsMasked,
    paymentStatus,
    bookingSource,
    recentTransactions,
  };
}

// ── RECENT ACTIVITY FEEDS ──────────────────────────────────────────────────

// Returns the most recent bookings for the dashboard activity feed.
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

// Returns the most recent payments for the dashboard activity feed.
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

// Returns recent unresolved validation errors shown on the dashboard.
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

// ── MERCHANT APPLICATION TREND ─────────────────────────────────────────────

// Returns daily merchant application counts over the past N days for the trend chart.
async function getMerchantApplicationTrend(days = 14) {
  const [rows] = await db.query(
    `SELECT
       DATE(COALESCE(submitted_at, created_at)) AS application_date,
       COUNT(*) AS total
     FROM merchant
     WHERE COALESCE(submitted_at, created_at) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(COALESCE(submitted_at, created_at))
     ORDER BY application_date ASC`,
    [days - 1]
  );

  return rows;
}

module.exports = {
  getDashboardSummary,
  getPlatformRevenueReport,
  getRecentBookings,
  getRecentPayments,
  getRecentValidationErrors,
  getMerchantApplicationTrend,
};
