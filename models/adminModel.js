const db = require('../config/db');
const { withResolvedMerchantImage } = require('../utils/merchantImages');

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
      (SELECT COUNT(*) FROM promotion WHERE approval_status = 'pending') AS pending_promotion_approvals,
      (SELECT COUNT(*) FROM merchant WHERE verification_status = 'pending') AS pending_merchant_validations,
      (SELECT COUNT(*) FROM validation_log) AS total_validation_errors
  `);

  return rows[0] || {};
}

async function getPlatformRevenueReport({ startDate, endDate } = {}) {
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
         COALESCE(SUM(CASE WHEN p.payment_status = 'paid' THEN p.amount * 0.20 ELSE 0 END), 0) AS platform_commission,
         COALESCE(SUM(CASE WHEN p.payment_status = 'paid' THEN p.amount * 0.80 ELSE 0 END), 0) AS merchant_payout,
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
    db.query(
      `SELECT
         DATE_FORMAT(COALESCE(p.paid_at, b.created_at), '%Y-%m') AS month,
         COUNT(DISTINCT b.booking_id) AS paid_bookings,
         COALESCE(SUM(p.amount), 0) AS gross_revenue,
         COALESCE(SUM(p.amount * 0.20), 0) AS platform_commission,
         COALESCE(SUM(p.amount * 0.80), 0) AS merchant_payout
       FROM payment p
       JOIN booking b ON b.booking_id = p.booking_id
       WHERE p.payment_status = 'paid' AND ${paymentDateFilter}
       GROUP BY DATE_FORMAT(COALESCE(p.paid_at, b.created_at), '%Y-%m')
       ORDER BY month DESC
       LIMIT 6`,
      rangeParams
    ),
    db.query(
      `SELECT
         COALESCE(NULLIF(s.category, ''), NULLIF(m.category, ''), 'Uncategorised') AS category,
         COUNT(DISTINCT b.booking_id) AS paid_bookings,
         COALESCE(SUM(p.amount), 0) AS gross_revenue,
         COALESCE(SUM(p.amount * 0.20), 0) AS platform_commission
       FROM payment p
       JOIN booking b ON b.booking_id = p.booking_id
       JOIN merchant m ON m.merchant_id = b.merchant_id
       JOIN service s ON s.service_id = b.service_id
       WHERE p.payment_status = 'paid' AND ${paymentDateFilter}
       GROUP BY COALESCE(NULLIF(s.category, ''), NULLIF(m.category, ''), 'Uncategorised')
       ORDER BY gross_revenue DESC`,
      rangeParams
    ),
    db.query(
      `SELECT
         m.merchant_id,
         m.merchant_name,
         COALESCE(NULLIF(m.category, ''), 'Uncategorised') AS category,
         COUNT(DISTINCT b.booking_id) AS paid_bookings,
         COALESCE(SUM(p.amount), 0) AS gross_revenue,
         COALESCE(SUM(p.amount * 0.20), 0) AS platform_commission,
         COALESCE(SUM(p.amount * 0.80), 0) AS merchant_payout
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

  return {
    overview: overviewRows[0] || {},
    monthly,
    categoryBreakdown,
    topMerchants,
    paymentStatus,
    bookingSource,
    recentTransactions,
  };
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

async function getValidationLogs({ module = 'all', status = 'all', search = '' } = {}) {
  const filters = [];
  const params = [];

  if (module && module !== 'all') {
    filters.push('vl.module = ?');
    params.push(module);
  }

  if (status === 'open') {
    filters.push('vl.is_resolved = FALSE');
  } else if (status === 'resolved') {
    filters.push('vl.is_resolved = TRUE');
  }

  const safeSearch = String(search || '').trim();
  if (safeSearch) {
    filters.push('(vl.module LIKE ? OR vl.error_type LIKE ? OR vl.error_message LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)');
    const like = '%' + safeSearch + '%';
    params.push(like, like, like, like, like);
  }

  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  const [rows] = await db.query(
    `SELECT
       vl.log_id,
       vl.user_id,
       vl.booking_id,
       vl.module,
       vl.error_type,
       vl.error_message,
       vl.is_resolved,
       vl.created_at,
       u.full_name AS customer_name,
       u.email AS customer_email,
       u.phone AS customer_phone
     FROM validation_log vl
     LEFT JOIN users u ON u.user_id = vl.user_id
     ${where}
     ORDER BY vl.created_at DESC
     LIMIT 200`,
    params
  );

  return rows;
}

async function getValidationLogSummary() {
  const [rows] = await db.query(
    `SELECT
       COUNT(*) AS total_logs,
       SUM(CASE WHEN is_resolved = FALSE THEN 1 ELSE 0 END) AS open_logs,
       SUM(CASE WHEN is_resolved = TRUE THEN 1 ELSE 0 END) AS resolved_logs,
       SUM(CASE WHEN module = 'whatsapp_support' AND is_resolved = FALSE THEN 1 ELSE 0 END) AS open_whatsapp_support
     FROM validation_log`
  );

  return rows[0] || {};
}

async function markValidationLogResolved(logId) {
  const [result] = await db.query(
    'UPDATE validation_log SET is_resolved = TRUE WHERE log_id = ?',
    [logId]
  );

  return result.affectedRows;
}

async function getValidationLogById(logId) {
  const [rows] = await db.query(
    `SELECT
       vl.*,
       u.full_name AS customer_name,
       u.email AS customer_email,
       u.phone AS customer_phone
     FROM validation_log vl
     LEFT JOIN users u ON u.user_id = vl.user_id
     WHERE vl.log_id = ?
     LIMIT 1`,
    [logId]
  );

  return rows[0] || null;
}

async function appendValidationLogReply(logId, reply, adminName) {
  const replyBlock = [
    '',
    'Admin reply by ' + (adminName || 'Uniday Support') + ':',
    String(reply || '').trim(),
    'Reply sent at: ' + new Date().toISOString()
  ].join('\n');

  const [result] = await db.query(
    `UPDATE validation_log
     SET error_message = CONCAT(error_message, ?),
         is_resolved = TRUE
     WHERE log_id = ?`,
    [replyBlock, logId]
  );

  return result.affectedRows;
}

async function getPendingMerchantApplications() {
  const [rows] = await db.query(
    `SELECT
       m.merchant_id,
       m.user_id,
       m.merchant_name,
       m.email AS merchant_email,
       m.business_uen,
       m.address,
       m.contact_no,
       m.verification_status,
       m.submitted_at,
       m.created_at,
       u.full_name AS owner_name,
       u.email AS owner_email,
       u.phone AS owner_phone
     FROM merchant m
     JOIN users u ON m.user_id = u.user_id
     WHERE m.verification_status = 'pending'
     ORDER BY COALESCE(m.submitted_at, m.created_at) ASC`
  );

  return rows;
}

async function getRecentMerchantValidationDecisions(limit = 8) {
  const [rows] = await db.query(
    `SELECT
       m.merchant_id,
       m.merchant_name,
       m.email AS merchant_email,
       m.business_uen,
       m.verification_status,
       m.verification_notes,
       m.verified_at,
       admin.full_name AS verified_by_name
     FROM merchant m
     LEFT JOIN users admin ON m.verified_by = admin.user_id
     WHERE m.verification_status IN ('approved', 'rejected')
       AND m.verified_at IS NOT NULL
     ORDER BY m.verified_at DESC
     LIMIT ?`,
    [limit]
  );

  return rows;
}

async function getMerchantValidationStatusSummary() {
  const [rows] = await db.query(
    `SELECT
       verification_status,
       COUNT(*) AS total
     FROM merchant
     GROUP BY verification_status`
  );

  const summary = {
    pending: 0,
    approved: 0,
    rejected: 0,
  };

  rows.forEach(row => {
    if (Object.prototype.hasOwnProperty.call(summary, row.verification_status)) {
      summary[row.verification_status] = row.total;
    }
  });

  return summary;
}

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

async function getMerchantAnalytics({ startDate, endDate } = {}) {
  const rangeParams = [startDate, endDate];
  const bookingDateFilter = 'DATE(b.created_at) BETWEEN ? AND ?';
  const paymentDateFilter = 'DATE(COALESCE(p.paid_at, b.created_at)) BETWEEN ? AND ?';

  const [
    [overviewRows],
    revenueTrend,
    topServices,
    revenueByCategory,
    peakSalesPeriods,
    paymentBreakdown,
    promotionPerformance,
    bookingStatus,
    peakBookingTimes,
    serviceUtilization,
    leadTimeRows,
    customerSegments,
    topCustomers,
    loyaltyUsage,
    reviewSummaryRows,
    campaignPerformance,
    bookingChannelAnalytics,
    listingPerformance,
    staffPerformance,
    financialRows,
    topMerchants,
  ] = await Promise.all([
    db.query(
      `SELECT
         COUNT(DISTINCT b.booking_id) AS total_bookings,
         COALESCE(SUM(CASE WHEN p.payment_status = 'paid' THEN p.amount ELSE 0 END), 0) AS revenue_generated,
         COUNT(DISTINCT b.customer_id) AS number_of_customers,
         COALESCE(
           SUM(CASE WHEN p.payment_status = 'paid' THEN p.amount ELSE 0 END) /
           NULLIF(COUNT(DISTINCT CASE WHEN p.payment_status = 'paid' THEN b.booking_id END), 0),
           0
         ) AS average_order_value,
         COALESCE(
           100 * SUM(CASE WHEN b.status IN ('confirmed', 'arrived', 'completed') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0),
           0
         ) AS booking_conversion_rate,
         COALESCE(
           100 * SUM(CASE WHEN b.status IN ('cancelled', 'no_show') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0),
           0
         ) AS cancellation_no_show_rate,
         COALESCE(AVG(r.rating), 0) AS customer_satisfaction_rating
       FROM booking b
       LEFT JOIN payment p ON p.booking_id = b.booking_id
       LEFT JOIN merchant_review r ON r.booking_id = b.booking_id
       WHERE ${bookingDateFilter}`,
      rangeParams
    ),
    db.query(
      `SELECT DATE(COALESCE(p.paid_at, b.created_at)) AS period_label, COALESCE(SUM(p.amount), 0) AS total
       FROM payment p
       JOIN booking b ON b.booking_id = p.booking_id
       WHERE p.payment_status = 'paid' AND ${paymentDateFilter}
       GROUP BY DATE(COALESCE(p.paid_at, b.created_at))
       ORDER BY period_label ASC`,
      rangeParams
    ).then(([rows]) => rows),
    db.query(
      `SELECT s.service_name, m.merchant_name, COUNT(*) AS bookings, COALESCE(SUM(b.total_amount), 0) AS revenue
       FROM booking b
       JOIN service s ON s.service_id = b.service_id
       JOIN merchant m ON m.merchant_id = b.merchant_id
       WHERE ${bookingDateFilter}
       GROUP BY s.service_id, s.service_name, m.merchant_name
       ORDER BY bookings DESC, revenue DESC
       LIMIT 8`,
      rangeParams
    ).then(([rows]) => rows),
    db.query(
      `SELECT COALESCE(NULLIF(s.category, ''), NULLIF(m.category, ''), 'Uncategorised') AS category, COALESCE(SUM(p.amount), 0) AS revenue
       FROM payment p
       JOIN booking b ON b.booking_id = p.booking_id
       JOIN service s ON s.service_id = b.service_id
       JOIN merchant m ON m.merchant_id = b.merchant_id
       WHERE p.payment_status = 'paid' AND ${paymentDateFilter}
       GROUP BY COALESCE(NULLIF(s.category, ''), NULLIF(m.category, ''), 'Uncategorised')
       ORDER BY revenue DESC`,
      rangeParams
    ).then(([rows]) => rows),
    db.query(
      `SELECT HOUR(COALESCE(p.paid_at, b.created_at)) AS hour_label, COALESCE(SUM(p.amount), 0) AS revenue
       FROM payment p
       JOIN booking b ON b.booking_id = p.booking_id
       WHERE p.payment_status = 'paid' AND ${paymentDateFilter}
       GROUP BY HOUR(COALESCE(p.paid_at, b.created_at))
       ORDER BY revenue DESC
       LIMIT 8`,
      rangeParams
    ).then(([rows]) => rows),
    db.query(
      `SELECT p.payment_method, COUNT(*) AS total, COALESCE(SUM(p.amount), 0) AS revenue
       FROM payment p
       JOIN booking b ON b.booking_id = p.booking_id
       WHERE ${paymentDateFilter}
       GROUP BY p.payment_method
       ORDER BY revenue DESC`,
      rangeParams
    ).then(([rows]) => rows),
    db.query(
      `SELECT v.campaign_name, v.voucher_code, COUNT(vr.redemption_id) AS redemptions, COALESCE(SUM(vr.discount_amount), 0) AS discount_given
       FROM voucher v
       LEFT JOIN voucher_redemption vr ON vr.voucher_id = v.voucher_id
       LEFT JOIN booking b ON b.booking_id = vr.booking_id
       WHERE b.booking_id IS NULL OR ${bookingDateFilter}
       GROUP BY v.voucher_id, v.campaign_name, v.voucher_code
       ORDER BY redemptions DESC
       LIMIT 8`,
      rangeParams
    ).then(([rows]) => rows),
    db.query(
      `SELECT b.status, COUNT(*) AS total
       FROM booking b
       WHERE ${bookingDateFilter}
       GROUP BY b.status
       ORDER BY total DESC`,
      rangeParams
    ).then(([rows]) => rows),
    db.query(
      `SELECT DAYNAME(ts.slot_date) AS day_label, HOUR(ts.start_time) AS hour_label, COUNT(*) AS bookings
       FROM booking b
       JOIN time_slot ts ON ts.slot_id = b.slot_id
       WHERE ${bookingDateFilter}
       GROUP BY DAYNAME(ts.slot_date), HOUR(ts.start_time)
       ORDER BY bookings DESC
       LIMIT 10`,
      rangeParams
    ).then(([rows]) => rows),
    db.query(
      `SELECT s.service_name, COUNT(b.booking_id) AS booked_slots, COUNT(DISTINCT ts.slot_id) AS total_slots
       FROM service s
       LEFT JOIN time_slot ts ON ts.service_id = s.service_id
       LEFT JOIN booking b ON b.slot_id = ts.slot_id AND ${bookingDateFilter}
       GROUP BY s.service_id, s.service_name
       ORDER BY booked_slots DESC
       LIMIT 8`,
      rangeParams
    ).then(([rows]) => rows),
    db.query(
      `SELECT COALESCE(AVG(TIMESTAMPDIFF(HOUR, b.created_at, CONCAT(ts.slot_date, ' ', ts.start_time))), 0) AS avg_lead_hours
       FROM booking b
       JOIN time_slot ts ON ts.slot_id = b.slot_id
       WHERE ${bookingDateFilter}`,
      rangeParams
    ).then(([rows]) => rows[0] || {}),
    db.query(
      `SELECT
         SUM(CASE WHEN booking_count = 1 THEN 1 ELSE 0 END) AS new_customers,
         SUM(CASE WHEN booking_count > 1 THEN 1 ELSE 0 END) AS returning_customers,
         COUNT(*) AS total_customers
       FROM (
         SELECT b.customer_id, COUNT(*) AS booking_count
         FROM booking b
         WHERE ${bookingDateFilter}
         GROUP BY b.customer_id
       ) customer_bookings`,
      rangeParams
    ).then(([rows]) => rows[0] || {}),
    db.query(
      `SELECT u.full_name, u.email, COUNT(b.booking_id) AS bookings,
              COUNT(DISTINCT r.review_id) AS reviews,
              COALESCE(SUM(p.amount), 0) AS lifetime_value
       FROM users u
       JOIN booking b ON b.customer_id = u.user_id
       LEFT JOIN payment p ON p.booking_id = b.booking_id AND p.payment_status = 'paid'
       LEFT JOIN merchant_review r ON r.booking_id = b.booking_id AND DATE(r.created_at) BETWEEN ? AND ?
       WHERE ${bookingDateFilter}
       GROUP BY u.user_id, u.full_name, u.email
       ORDER BY bookings DESC, lifetime_value DESC
       LIMIT 8`,
      [...rangeParams, ...rangeParams]
    ).then(([rows]) => rows),
    db.query(
      `SELECT transaction_type, COALESCE(SUM(points_amount), 0) AS points, COALESCE(SUM(cashback_amount), 0) AS cashback
       FROM loyalty_transaction
       WHERE DATE(created_at) BETWEEN ? AND ?
       GROUP BY transaction_type
       ORDER BY points DESC, cashback DESC`,
      rangeParams
    ).then(([rows]) => rows),
    db.query(
      `SELECT COUNT(*) AS review_count, COALESCE(AVG(rating), 0) AS average_rating
       FROM merchant_review
       WHERE DATE(created_at) BETWEEN ? AND ?`,
      rangeParams
    ).then(([rows]) => rows[0] || {}),
    db.query(
      `SELECT campaign_name, voucher_code, usage_limit, start_date, end_date, is_active
       FROM voucher
       ORDER BY start_date DESC
       LIMIT 8`
    ).then(([rows]) => rows),
    db.query(
      `SELECT
         CASE
           WHEN source = 'whatsapp' THEN 'WhatsApp booking'
           WHEN source = 'qr' AND booking_type = 'walk_in' THEN 'Walk-in QR'
           WHEN source = 'qr' THEN 'QR booking'
           ELSE CONCAT(UPPER(LEFT(source, 1)), SUBSTRING(source, 2), ' booking')
         END AS channel_label,
         COUNT(*) AS total,
         COALESCE(SUM(total_amount), 0) AS revenue
       FROM booking b
       WHERE ${bookingDateFilter}
       GROUP BY channel_label
       ORDER BY total DESC`,
      rangeParams
    ).then(([rows]) => rows),
    db.query(
      `SELECT m.merchant_name, COUNT(fl.listing_id) AS listings, SUM(CASE WHEN fl.is_visible THEN 1 ELSE 0 END) AS visible_listings
       FROM featured_listing fl
       JOIN merchant m ON m.merchant_id = fl.merchant_id
       GROUP BY m.merchant_id, m.merchant_name
       ORDER BY visible_listings DESC, listings DESC
       LIMIT 8`
    ).then(([rows]) => rows),
    db.query(
      `SELECT COALESCE(st.full_name, 'Unassigned') AS staff_name, COUNT(b.booking_id) AS bookings, COALESCE(SUM(b.total_amount), 0) AS revenue
       FROM booking b
       LEFT JOIN staff st ON st.staff_id = b.staff_id
       WHERE ${bookingDateFilter}
       GROUP BY COALESCE(st.full_name, 'Unassigned')
       ORDER BY bookings DESC
       LIMIT 8`,
      rangeParams
    ).then(([rows]) => rows),
    db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN payment_status IN ('refunded', 'partially_refunded') THEN refund_amount ELSE 0 END), 0) AS refunded_amount,
         SUM(CASE WHEN payment_status IN ('refunded', 'partially_refunded') THEN 1 ELSE 0 END) AS refund_count,
         COALESCE(SUM(amount) * 0.09, 0) AS estimated_tax,
         COALESCE(SUM(amount), 0) AS gross_revenue
       FROM payment p
       JOIN booking b ON b.booking_id = p.booking_id
       WHERE ${paymentDateFilter}`,
      rangeParams
    ).then(([rows]) => rows[0] || {}),
    db.query(
      `SELECT m.merchant_id, m.merchant_name, COALESCE(NULLIF(m.category, ''), 'Uncategorised') AS category,
              COUNT(DISTINCT b.booking_id) AS bookings,
              COUNT(DISTINCT b.customer_id) AS customers,
              COALESCE(SUM(CASE WHEN p.payment_status = 'paid' THEN p.amount ELSE 0 END), 0) AS revenue,
              COALESCE(AVG(r.rating), 0) AS rating,
              MAX(fl.listing_id) AS featured_listing_id,
              MAX(CASE WHEN fl.listing_id IS NOT NULL THEN 1 ELSE 0 END) AS has_featured_listing,
              MAX(CASE WHEN fl.listing_id IS NOT NULL AND fl.is_visible = TRUE THEN 1 ELSE 0 END) AS is_featured
       FROM merchant m
       LEFT JOIN booking b ON b.merchant_id = m.merchant_id AND ${bookingDateFilter}
       LEFT JOIN payment p ON p.booking_id = b.booking_id
       LEFT JOIN merchant_review r ON r.booking_id = b.booking_id
       LEFT JOIN featured_listing fl ON fl.merchant_id = m.merchant_id
       GROUP BY m.merchant_id, m.merchant_name, m.category
       ORDER BY revenue DESC, bookings DESC
       LIMIT 12`,
      rangeParams
    ).then(([rows]) => rows),
  ]);

  return {
    overview: overviewRows[0] || {},
    revenueTrend,
    topServices,
    revenueByCategory,
    peakSalesPeriods,
    paymentBreakdown,
    promotionPerformance,
    bookingStatus,
    peakBookingTimes,
    serviceUtilization,
    leadTime: leadTimeRows,
    customerSegments,
    topCustomers,
    loyaltyUsage,
    reviewSummary: reviewSummaryRows,
    campaignPerformance,
    bookingChannelAnalytics,
    listingPerformance,
    staffPerformance,
    financial: financialRows,
    topMerchants,
  };
}

async function addMerchantToFeatured(merchantId) {
  const [[merchant]] = await db.query(
    `SELECT merchant_id, merchant_name, category
     FROM merchant
     WHERE merchant_id = ?`,
    [merchantId]
  );

  if (!merchant) {
    throw new Error('Merchant not found');
  }

  const title = merchant.merchant_name;
  const description = `Featured ${merchant.category || 'merchant'} on Uniday.`;

  const [existing] = await db.query(
    'SELECT listing_id FROM featured_listing WHERE merchant_id = ? LIMIT 1',
    [merchantId]
  );

  if (existing.length) {
    await db.query(
      `UPDATE featured_listing
       SET title = ?, description = ?, is_visible = TRUE
       WHERE merchant_id = ?`,
      [title, description, merchantId]
    );
    return existing[0].listing_id;
  }

  const [result] = await db.query(
    `INSERT INTO featured_listing (merchant_id, title, description, is_visible)
     VALUES (?, ?, ?, TRUE)`,
    [merchantId, title, description]
  );

  return result.insertId;
}

async function getFeaturedMerchantListings() {
  const [rows] = await db.query(
    `SELECT
       fl.listing_id,
       fl.merchant_id,
       fl.title,
       fl.description,
       fl.display_order,
       fl.is_visible,
       fl.created_at,
       m.merchant_name,
       COALESCE(NULLIF(m.category, ''), 'Uncategorised') AS category,
       COALESCE(NULLIF(fl.image_path, ''), NULLIF(m.profile_image, '')) AS image_path,
       m.profile_image,
       COUNT(DISTINCT b.booking_id) AS bookings,
       COUNT(DISTINCT b.customer_id) AS customers,
       COALESCE(SUM(CASE WHEN p.payment_status = 'paid' THEN p.amount ELSE 0 END), 0) AS revenue,
       COALESCE(AVG(r.rating), 0) AS rating
     FROM featured_listing fl
     JOIN merchant m ON m.merchant_id = fl.merchant_id
     LEFT JOIN booking b ON b.merchant_id = m.merchant_id
     LEFT JOIN payment p ON p.booking_id = b.booking_id
     LEFT JOIN merchant_review r ON r.booking_id = b.booking_id
     GROUP BY
       fl.listing_id,
       fl.merchant_id,
       fl.title,
       fl.description,
       fl.display_order,
       fl.is_visible,
       fl.created_at,
       m.merchant_name,
       m.category,
       fl.image_path,
       m.profile_image
      ORDER BY fl.is_visible DESC, fl.display_order ASC, revenue DESC, fl.created_at DESC`
   );

  return rows.map(withResolvedMerchantImage);
}

async function toggleFeaturedMerchantVisibility(listingId) {
  await db.query(
    'UPDATE featured_listing SET is_visible = NOT is_visible WHERE listing_id = ?',
    [listingId]
  );
}

async function removeFeaturedMerchantListing(listingId) {
  await db.query(
    'DELETE FROM featured_listing WHERE listing_id = ?',
    [listingId]
  );
}

async function getCustomerAnalytics({ startDate, endDate } = {}) {
  const rangeParams = [startDate, endDate];
  const bookingDateFilter = 'DATE(b.created_at) BETWEEN ? AND ?';
  const paymentDateFilter = 'DATE(COALESCE(p.paid_at, b.created_at)) BETWEEN ? AND ?';

  const [
    overviewRows,
    accountProfiles,
    upcomingBookings,
    pastBookings,
    bookingStatus,
    loyaltySummaryRows,
    loyaltyTransactions,
    availableVouchers,
    spendingTrend,
    spendingCategories,
    mostVisitedMerchants,
    favouriteServices,
    bookingFrequency,
    recommendedMerchants,
    suggestedServices,
    behaviourPromotions,
    reviewSummaryRows,
    recentReviews,
    platformFeedback,
    securityRows,
    reminderRows,
    qrRows,
    paymentMethods,
  ] = await Promise.all([
    db.query(
      `SELECT
         COUNT(DISTINCT u.user_id) AS total_customers,
         COUNT(DISTINCT lw.wallet_id) AS loyalty_members,
         COALESCE(SUM(lw.points_balance), 0) AS reward_points_balance,
         COALESCE(AVG(lw.points_balance), 0) AS avg_points_balance,
         COUNT(DISTINCT f.favourite_id) AS preferred_merchants,
         COUNT(DISTINCT CASE WHEN p.payment_status = 'paid' THEN p.payment_method END) AS saved_payment_methods,
         COALESCE(SUM(CASE WHEN p.payment_status = 'paid' THEN p.amount ELSE 0 END), 0) AS total_amount_spent,
         COALESCE(AVG(CASE WHEN p.payment_status = 'paid' THEN p.amount END), 0) AS average_order_value
       FROM users u
       LEFT JOIN loyalty_wallet lw ON lw.customer_id = u.user_id
       LEFT JOIN favourite f ON f.customer_id = u.user_id
       LEFT JOIN booking b ON b.customer_id = u.user_id AND ${bookingDateFilter}
       LEFT JOIN payment p ON p.booking_id = b.booking_id
       WHERE u.role = 'customer'`,
      rangeParams
    ).then(([rows]) => rows[0] || {}),
    db.query(
      `SELECT
         u.user_id,
         u.full_name,
         u.email,
         u.phone,
         c.date_of_birth,
         u.status,
         u.created_at,
         COALESCE(lw.points_balance, 0) AS points_balance,
         COALESCE(lw.lifetime_points_earned, 0) AS lifetime_points_earned,
         COALESCE(lw.lifetime_points_redeemed, 0) AS lifetime_points_redeemed,
         COUNT(DISTINCT b.booking_id) AS bookings,
         COALESCE(SUM(CASE WHEN p.payment_status = 'paid' THEN p.amount ELSE 0 END), 0) AS total_spent,
         COUNT(DISTINCT f.favourite_id) AS favourites
       FROM users u
       LEFT JOIN loyalty_wallet lw ON lw.customer_id = u.user_id
       LEFT JOIN customer c ON c.user_id = u.user_id
       LEFT JOIN booking b ON b.customer_id = u.user_id AND ${bookingDateFilter}
       LEFT JOIN payment p ON p.booking_id = b.booking_id
       LEFT JOIN favourite f ON f.customer_id = u.user_id
       WHERE u.role = 'customer'
       GROUP BY u.user_id, u.full_name, u.email, u.phone, c.date_of_birth, u.status, u.created_at,
                lw.points_balance, lw.lifetime_points_earned, lw.lifetime_points_redeemed
       ORDER BY total_spent DESC, bookings DESC
       LIMIT 10`,
      rangeParams
    ).then(([rows]) => rows),
    db.query(
      `SELECT b.booking_id, b.status, ts.slot_date, ts.start_time, u.full_name AS customer_name,
              m.merchant_name, s.service_name, b.total_amount
       FROM booking b
       JOIN users u ON u.user_id = b.customer_id
       JOIN merchant m ON m.merchant_id = b.merchant_id
       JOIN service s ON s.service_id = b.service_id
       JOIN time_slot ts ON ts.slot_id = b.slot_id
       WHERE u.role = 'customer'
         AND b.status NOT IN ('cancelled', 'completed', 'no_show')
         AND CONCAT(ts.slot_date, ' ', ts.start_time) >= NOW()
       ORDER BY ts.slot_date ASC, ts.start_time ASC
       LIMIT 8`
    ).then(([rows]) => rows),
    db.query(
      `SELECT b.booking_id, b.status, ts.slot_date, ts.start_time, u.full_name AS customer_name,
              m.merchant_name, s.service_name, b.total_amount
       FROM booking b
       JOIN users u ON u.user_id = b.customer_id
       JOIN merchant m ON m.merchant_id = b.merchant_id
       JOIN service s ON s.service_id = b.service_id
       JOIN time_slot ts ON ts.slot_id = b.slot_id
       WHERE u.role = 'customer'
         AND (CONCAT(ts.slot_date, ' ', ts.start_time) < NOW() OR b.status IN ('completed', 'cancelled', 'no_show'))
       ORDER BY ts.slot_date DESC, ts.start_time DESC
       LIMIT 8`
    ).then(([rows]) => rows),
    db.query(
      `SELECT b.status, COUNT(*) AS total
       FROM booking b
       JOIN users u ON u.user_id = b.customer_id
       WHERE u.role = 'customer' AND ${bookingDateFilter}
       GROUP BY b.status
       ORDER BY total DESC`,
      rangeParams
    ).then(([rows]) => rows),
    db.query(
      `SELECT
         COALESCE(SUM(points_balance), 0) AS points_balance,
         COALESCE(SUM(lifetime_points_earned), 0) AS points_earned,
         COALESCE(SUM(lifetime_points_redeemed), 0) AS points_redeemed,
         COALESCE(SUM(cashback_balance), 0) AS cashback_balance,
         SUM(CASE WHEN points_balance >= 2000 THEN 1 ELSE 0 END) AS gold_members,
         SUM(CASE WHEN points_balance >= 800 AND points_balance < 2000 THEN 1 ELSE 0 END) AS silver_members,
         SUM(CASE WHEN points_balance < 800 THEN 1 ELSE 0 END) AS bronze_members
       FROM loyalty_wallet`
    ).then(([rows]) => rows[0] || {}),
    db.query(
      `SELECT lt.transaction_type, COALESCE(SUM(lt.points_amount), 0) AS points, COALESCE(SUM(lt.cashback_amount), 0) AS cashback
       FROM loyalty_transaction lt
       WHERE DATE(lt.created_at) BETWEEN ? AND ?
       GROUP BY lt.transaction_type
       ORDER BY points DESC, cashback DESC`,
      rangeParams
    ).then(([rows]) => rows),
    db.query(
      `SELECT voucher_code, campaign_name, discount_type, discount_value, min_spend, end_date
       FROM voucher
       WHERE is_active = TRUE AND CURDATE() BETWEEN start_date AND end_date
       ORDER BY end_date ASC
       LIMIT 8`
    ).then(([rows]) => rows),
    db.query(
      `SELECT DATE_FORMAT(COALESCE(p.paid_at, b.created_at), '%Y-%m') AS month_label,
              COALESCE(SUM(p.amount), 0) AS total
       FROM payment p
       JOIN booking b ON b.booking_id = p.booking_id
       JOIN users u ON u.user_id = b.customer_id
       WHERE u.role = 'customer' AND p.payment_status = 'paid' AND ${paymentDateFilter}
       GROUP BY DATE_FORMAT(COALESCE(p.paid_at, b.created_at), '%Y-%m')
       ORDER BY month_label ASC`,
      rangeParams
    ).then(([rows]) => rows),
    db.query(
      `SELECT COALESCE(NULLIF(s.category, ''), NULLIF(m.category, ''), 'Uncategorised') AS category, COALESCE(SUM(p.amount), 0) AS total
       FROM payment p
       JOIN booking b ON b.booking_id = p.booking_id
       JOIN service s ON s.service_id = b.service_id
       JOIN merchant m ON m.merchant_id = b.merchant_id
       JOIN users u ON u.user_id = b.customer_id
       WHERE u.role = 'customer' AND p.payment_status = 'paid' AND ${paymentDateFilter}
       GROUP BY COALESCE(NULLIF(s.category, ''), NULLIF(m.category, ''), 'Uncategorised')
       ORDER BY total DESC`,
      rangeParams
    ).then(([rows]) => rows),
    db.query(
      `SELECT m.merchant_name, COUNT(*) AS visits, COALESCE(SUM(p.amount), 0) AS spent
       FROM booking b
       JOIN users u ON u.user_id = b.customer_id
       JOIN merchant m ON m.merchant_id = b.merchant_id
       LEFT JOIN payment p ON p.booking_id = b.booking_id AND p.payment_status = 'paid'
       WHERE u.role = 'customer' AND ${bookingDateFilter}
       GROUP BY m.merchant_id, m.merchant_name
       ORDER BY visits DESC, spent DESC
       LIMIT 8`,
      rangeParams
    ).then(([rows]) => rows),
    db.query(
      `SELECT s.service_name, COALESCE(NULLIF(s.category, ''), NULLIF(m.category, ''), 'Uncategorised') AS category,
              COUNT(*) AS bookings, COALESCE(SUM(b.total_amount), 0) AS spent
       FROM booking b
       JOIN users u ON u.user_id = b.customer_id
       JOIN service s ON s.service_id = b.service_id
       JOIN merchant m ON m.merchant_id = b.merchant_id
       WHERE u.role = 'customer' AND ${bookingDateFilter}
       GROUP BY s.service_id, s.service_name, s.category, m.category
       ORDER BY bookings DESC, spent DESC
       LIMIT 8`,
      rangeParams
    ).then(([rows]) => rows),
    db.query(
      `SELECT DAYNAME(ts.slot_date) AS day_label, COUNT(*) AS bookings
       FROM booking b
       JOIN users u ON u.user_id = b.customer_id
       JOIN time_slot ts ON ts.slot_id = b.slot_id
       WHERE u.role = 'customer' AND ${bookingDateFilter}
       GROUP BY DAYNAME(ts.slot_date)
       ORDER BY bookings DESC`,
      rangeParams
    ).then(([rows]) => rows),
    db.query(
      `SELECT m.merchant_name, COALESCE(NULLIF(m.category, ''), 'Uncategorised') AS category,
              COUNT(b.booking_id) AS bookings, COALESCE(AVG(r.rating), 0) AS rating
       FROM merchant m
       LEFT JOIN booking b ON b.merchant_id = m.merchant_id
       LEFT JOIN merchant_review r ON r.merchant_id = m.merchant_id
       GROUP BY m.merchant_id, m.merchant_name, m.category
       ORDER BY bookings DESC, rating DESC
       LIMIT 8`
    ).then(([rows]) => rows),
    db.query(
      `SELECT s.service_name, m.merchant_name, COALESCE(NULLIF(s.category, ''), NULLIF(m.category, ''), 'Uncategorised') AS category,
              COUNT(b.booking_id) AS bookings
       FROM service s
       JOIN merchant m ON m.merchant_id = s.merchant_id
       LEFT JOIN booking b ON b.service_id = s.service_id
       WHERE s.is_active = TRUE
       GROUP BY s.service_id, s.service_name, s.category, m.merchant_name, m.category
       ORDER BY bookings DESC
       LIMIT 8`
    ).then(([rows]) => rows),
    db.query(
      `SELECT voucher_code, campaign_name, discount_type, discount_value, min_spend, end_date
       FROM voucher
       WHERE is_active = TRUE AND end_date >= CURDATE()
       ORDER BY start_date DESC
       LIMIT 8`
    ).then(([rows]) => rows),
    db.query(
      `SELECT COUNT(*) AS review_count, COALESCE(AVG(rating), 0) AS avg_rating
       FROM merchant_review
       WHERE DATE(created_at) BETWEEN ? AND ?`,
      rangeParams
    ).then(([rows]) => rows[0] || {}),
    db.query(
      `SELECT r.review_id, r.rating, r.review_text, r.created_at,
              u.full_name AS customer_name, m.merchant_name, s.service_name
       FROM merchant_review r
       JOIN users u ON u.user_id = r.customer_id
       JOIN merchant m ON m.merchant_id = r.merchant_id
       JOIN service s ON s.service_id = r.service_id
       ORDER BY r.created_at DESC
       LIMIT 8`
    ).then(([rows]) => rows),
    db.query(
      `SELECT feedback_type, COUNT(*) AS total, COALESCE(AVG(rating), 0) AS avg_rating
       FROM platform_feedback
       WHERE DATE(created_at) BETWEEN ? AND ?
       GROUP BY feedback_type
       ORDER BY total DESC`,
      rangeParams
    ).then(([rows]) => rows),
    db.query(
      `SELECT
         COUNT(*) AS customer_accounts,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_accounts,
         SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended_accounts
       FROM users
       WHERE role = 'customer'`
    ).then(([rows]) => rows[0] || {}),
    db.query(
      `SELECT notification_type, status, COUNT(*) AS total
       FROM notification
       WHERE notification_type = 'reminder_24h'
       GROUP BY notification_type, status`
    ).then(([rows]) => rows),
    db.query(
      `SELECT source, COUNT(*) AS total
       FROM booking b
       JOIN users u ON u.user_id = b.customer_id
       WHERE u.role = 'customer' AND ${bookingDateFilter}
       GROUP BY source
       ORDER BY total DESC`,
      rangeParams
    ).then(([rows]) => rows),
    db.query(
      `SELECT p.payment_method, COUNT(*) AS total
       FROM payment p
       JOIN booking b ON b.booking_id = p.booking_id
       JOIN users u ON u.user_id = b.customer_id
       WHERE u.role = 'customer' AND ${paymentDateFilter}
       GROUP BY p.payment_method
       ORDER BY total DESC`,
      rangeParams
    ).then(([rows]) => rows),
  ]);

  return {
    overview: overviewRows,
    accountProfiles,
    upcomingBookings,
    pastBookings,
    bookingStatus,
    loyaltySummary: loyaltySummaryRows,
    loyaltyTransactions,
    availableVouchers,
    spendingTrend,
    spendingCategories,
    mostVisitedMerchants,
    favouriteServices,
    bookingFrequency,
    recommendedMerchants,
    suggestedServices,
    behaviourPromotions,
    reviewSummary: reviewSummaryRows,
    recentReviews,
    platformFeedback,
    security: securityRows,
    reminders: reminderRows,
    qrAccess: qrRows,
    paymentMethods,
  };
}

async function approveMerchant(merchantId, adminId) {
  const [result] = await db.query(
    `UPDATE merchant
     SET verification_status = 'approved',
         verification_notes = NULL,
         verified_at = NOW(),
         verified_by = ?
     WHERE merchant_id = ?
       AND verification_status = 'pending'`,
    [adminId, merchantId]
  );

  if (result.affectedRows > 0) {
    await logAdminAction(adminId, 'APPROVE_MERCHANT', 'merchant', merchantId, 'Approved merchant application.');
  }

  return result.affectedRows;
}

async function rejectMerchant(merchantId, adminId, notes) {
  const [result] = await db.query(
    `UPDATE merchant
     SET verification_status = 'rejected',
         verification_notes = ?,
         verified_at = NOW(),
         verified_by = ?
     WHERE merchant_id = ?
       AND verification_status = 'pending'`,
    [notes || null, adminId, merchantId]
  );

  if (result.affectedRows > 0) {
    await logAdminAction(adminId, 'REJECT_MERCHANT', 'merchant', merchantId, notes || 'Rejected merchant application.');
  }

  return result.affectedRows;
}

async function logAdminAction(adminId, actionType, targetTable, targetId, description) {
  try {
    await db.query(
      `INSERT INTO admin_action_log
        (admin_id, action_type, target_table, target_id, description)
       VALUES (?, ?, ?, ?, ?)`,
      [adminId, actionType, targetTable, targetId, description]
    );
  } catch (err) {
    console.error('Failed to write admin action log:', err.message);
  }
}

function searchClause(search, columns) {
  const term = String(search || '').trim();
  if (!term) return { clause: '', params: [] };

  return {
    clause: ` AND (${columns.map(column => `${column} LIKE ?`).join(' OR ')})`,
    params: columns.map(() => `%${term}%`),
  };
}

async function getUserManagementSummary() {
  // Counts shown on the user management landing cards.
  const [rows] = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE role = 'customer') AS customers,
      (SELECT COUNT(*) FROM users WHERE role = 'customer' AND status = 'active') AS active_customers,
      (SELECT COUNT(*) FROM users WHERE role = 'customer' AND status = 'suspended') AS suspended_customers,
      (SELECT COUNT(*) FROM users WHERE role = 'merchant') AS merchants,
      (SELECT COUNT(*) FROM users u JOIN merchant m ON m.user_id = u.user_id WHERE u.role = 'merchant' AND u.status = 'active' AND m.is_active = 1) AS active_merchants,
      (SELECT COUNT(*) FROM users u JOIN merchant m ON m.user_id = u.user_id WHERE u.role = 'merchant' AND (u.status = 'suspended' OR m.is_active = 0)) AS disabled_merchants
  `);

  return rows[0] || {};
}

async function getManagedCustomers(search = '') {
  // Search customer accounts and include booking, spending and loyalty totals.
  const filter = searchClause(search, ['u.full_name', 'u.email', 'u.phone']);
  const [rows] = await db.query(
    `SELECT
       u.user_id,
       u.full_name,
       u.email,
       u.phone,
       u.status,
       u.created_at,
       COALESCE(bs.bookings, 0) AS bookings,
       COALESCE(bs.total_spent, 0) AS total_spent,
       CASE
         WHEN COALESCE(bs.total_spent, 0) >= 2000 THEN 'Platinum'
         WHEN COALESCE(bs.total_spent, 0) >= 1000 THEN 'Gold'
         WHEN COALESCE(bs.total_spent, 0) >= 500 THEN 'Silver'
         ELSE 'Bronze'
       END AS tier,
       bs.last_booking_at,
       COALESCE(ls.points_balance, 0) AS points_balance
     FROM users u
     LEFT JOIN (
       SELECT
         b.customer_id,
         COUNT(DISTINCT b.booking_id) AS bookings,
         COALESCE(SUM(CASE WHEN p.payment_status = 'paid' THEN p.amount ELSE 0 END), 0) AS total_spent,
         MAX(COALESCE(p.paid_at, b.created_at)) AS last_booking_at
       FROM booking b
       LEFT JOIN payment p ON p.booking_id = b.booking_id
       WHERE b.customer_id IS NOT NULL
       GROUP BY b.customer_id
     ) bs ON bs.customer_id = u.user_id
     LEFT JOIN (
       SELECT customer_id, COALESCE(SUM(points_balance), 0) AS points_balance
       FROM loyalty_wallet
       GROUP BY customer_id
     ) ls ON ls.customer_id = u.user_id
     WHERE u.role = 'customer'
       ${filter.clause}
     ORDER BY u.user_id ASC`,
    filter.params
  );

  return rows;
}

async function getManagedMerchants(search = '', verification = 'all') {
  // Search merchant accounts and optionally filter by verification status.
  const filter = searchClause(search, ['u.full_name', 'u.email', 'u.phone', 'm.merchant_name', 'm.email', 'm.contact_no']);
  const safeVerification = ['pending', 'approved'].includes(verification) ? verification : null;
  const verificationClause = safeVerification ? ' AND m.verification_status = ?' : '';
  const params = [...filter.params];
  if (safeVerification) params.push(safeVerification);

  const [rows] = await db.query(
    `SELECT
       u.user_id,
       u.full_name AS owner_name,
       u.email AS owner_email,
       u.phone AS owner_phone,
       u.status AS user_status,
       u.created_at,
       m.merchant_id,
       m.merchant_name,
       m.email AS merchant_email,
       m.category,
       m.contact_no,
       m.address,
       m.is_active,
       m.verification_status,
       COUNT(DISTINCT b.booking_id) AS bookings,
       COALESCE(SUM(CASE WHEN p.payment_status = 'paid' THEN p.amount ELSE 0 END), 0) AS total_revenue,
       MAX(COALESCE(p.paid_at, b.created_at)) AS last_booking_at
     FROM users u
     JOIN merchant m ON m.user_id = u.user_id
     LEFT JOIN booking b ON b.merchant_id = m.merchant_id
     LEFT JOIN payment p ON p.booking_id = b.booking_id
     WHERE u.role = 'merchant'
       AND m.verification_status <> 'rejected'
       ${filter.clause}
       ${verificationClause}
     GROUP BY u.user_id, u.full_name, u.email, u.phone, u.status, u.created_at,
              m.merchant_id, m.merchant_name, m.email, m.category, m.contact_no,
              m.address, m.is_active, m.verification_status
     ORDER BY m.merchant_id ASC`,
    params
  );

  return rows;
}

async function setUserAccountStatus(userId, status, adminId, reason = null) {
  // Customer enable/disable uses the users.status field.
  const safeStatus = status === 'suspended' ? 'suspended' : 'active';
  const [result] = await db.query(
    `UPDATE users
     SET status = ?
     WHERE user_id = ?
       AND role IN ('customer', 'merchant')`,
    [safeStatus, userId]
  );

  if (result.affectedRows > 0) {
    const description = safeStatus === 'active'
      ? 'Enabled user account.'
      : `Disabled user account. Reason: ${reason || 'Not specified'}.`;
    await logAdminAction(adminId, safeStatus === 'active' ? 'ENABLE_USER' : 'DISABLE_USER', 'users', userId, description);
  }

  return result.affectedRows;
}

async function setMerchantAccountStatus(merchantId, enabled, adminId, reason = null) {
  // Merchant enable/disable must keep merchant and user status in sync.
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [[merchant]] = await connection.query(
      `SELECT user_id
       FROM merchant
       WHERE merchant_id = ?
       FOR UPDATE`,
      [merchantId]
    );

    if (!merchant) {
      await connection.rollback();
      return 0;
    }

    await connection.query(
      `UPDATE merchant
       SET is_active = ?
       WHERE merchant_id = ?`,
      [enabled ? 1 : 0, merchantId]
    );

    await connection.query(
      `UPDATE users
       SET status = ?
       WHERE user_id = ?`,
      [enabled ? 'active' : 'suspended', merchant.user_id]
    );

    await connection.commit();
    await logAdminAction(
      adminId,
      enabled ? 'ENABLE_MERCHANT' : 'DISABLE_MERCHANT',
      'merchant',
      merchantId,
      enabled ? 'Enabled merchant account.' : `Disabled merchant account. Reason: ${reason || 'Not specified'}.`
    );
    return 1;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function getCustomerAccount(customerId) {
  // Basic customer profile for the booking detail page header.
  const [rows] = await db.query(
    `SELECT user_id, full_name, email, phone, status, created_at
     FROM users
     WHERE user_id = ?
       AND role = 'customer'`,
    [customerId]
  );

  return rows[0] || null;
}

async function getCustomerBookingsForAdmin(customerId) {
  // Full booking history for one customer, including merchant, service and payment.
  const [rows] = await db.query(
    `SELECT
       b.booking_id,
       b.status,
       b.source,
       b.total_amount,
       b.created_at,
       ts.slot_date AS booking_date,
       ts.start_time AS booking_time,
       m.merchant_name,
       s.service_name,
       p.payment_status,
       p.payment_method,
       p.amount AS paid_amount
     FROM booking b
     JOIN time_slot ts ON ts.slot_id = b.slot_id
     JOIN merchant m ON m.merchant_id = b.merchant_id
     JOIN service s ON s.service_id = b.service_id
     LEFT JOIN payment p ON p.booking_id = b.booking_id
     WHERE b.customer_id = ?
     ORDER BY ts.slot_date DESC, ts.start_time DESC`,
    [customerId]
  );

  return rows;
}

async function getMerchantAccount(merchantId) {
  // Basic merchant profile for the booking detail page header.
  const [rows] = await db.query(
    `SELECT
       m.merchant_id,
       m.merchant_name,
       m.email,
       m.category,
       m.contact_no,
       m.address,
       m.is_active,
       m.verification_status,
       u.user_id,
       u.full_name AS owner_name,
       u.email AS owner_email,
       u.status AS owner_status
     FROM merchant m
     JOIN users u ON u.user_id = m.user_id
     WHERE m.merchant_id = ?`,
    [merchantId]
  );

  return rows[0] || null;
}

async function getMerchantBookingsForAdmin(merchantId) {
  // Full booking history for one merchant, including customer and payment details.
  const [rows] = await db.query(
    `SELECT
       b.booking_id,
       b.status,
       b.source,
       b.total_amount,
       b.created_at,
       ts.slot_date AS booking_date,
       ts.start_time AS booking_time,
       COALESCE(c.full_name, b.guest_name) AS customer_name,
       COALESCE(c.email, b.guest_email) AS customer_email,
       COALESCE(c.phone, b.guest_phone) AS customer_phone,
       s.service_name,
       p.payment_status,
       p.payment_method,
       p.amount AS paid_amount
     FROM booking b
     JOIN time_slot ts ON ts.slot_id = b.slot_id
     JOIN service s ON s.service_id = b.service_id
     LEFT JOIN customer c ON c.customer_id = b.customer_id
     LEFT JOIN payment p ON p.booking_id = b.booking_id
     WHERE b.merchant_id = ?
     ORDER BY ts.slot_date DESC, ts.start_time DESC`,
    [merchantId]
  );

  return rows;
}

async function getPlatformFeedback({ type = 'all', rating = 'all', search = '' } = {}) {
  const params = [];
  const clauses = [];

  if (type && type !== 'all') {
    clauses.push('pf.feedback_type = ?');
    params.push(type);
  }

  if (rating && rating !== 'all') {
    clauses.push('pf.rating = ?');
    params.push(Number(rating));
  }

  const filter = searchClause(search, [
    'u.full_name',
    'u.email',
    'm.merchant_name',
    's.service_name',
    'pf.feedback_text',
  ]);
  if (filter.clause) {
    clauses.push(filter.clause.replace(/^\s*AND\s+/i, ''));
    params.push(...filter.params);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const [rows] = await db.query(
    `SELECT
       pf.feedback_id,
       pf.booking_id,
       pf.customer_id,
       pf.rating,
       pf.feedback_type,
       pf.feedback_text,
       pf.created_at,
       u.full_name AS customer_name,
       u.email AS customer_email,
       b.merchant_id,
       b.service_id,
       b.status AS booking_status,
       ts.slot_date AS booking_date,
       ts.start_time AS booking_time,
       m.merchant_name,
       s.service_name
     FROM platform_feedback pf
     JOIN users u ON u.user_id = pf.customer_id
     LEFT JOIN booking b ON b.booking_id = pf.booking_id
     LEFT JOIN time_slot ts ON ts.slot_id = b.slot_id
     LEFT JOIN merchant m ON m.merchant_id = b.merchant_id
     LEFT JOIN service s ON s.service_id = b.service_id
     ${whereSql}
     ORDER BY pf.created_at DESC, pf.feedback_id DESC`,
    params
  );

  return rows;
}

async function getPlatformFeedbackSummary() {
  const [[summary]] = await db.query(
    `SELECT
       COUNT(*) AS total_feedback,
       COALESCE(AVG(rating), 0) AS average_rating,
       SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) AS positive_count,
       SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) AS low_rating_count
     FROM platform_feedback`
  );

  const [byType] = await db.query(
    `SELECT feedback_type, COUNT(*) AS total, COALESCE(AVG(rating), 0) AS average_rating
     FROM platform_feedback
     GROUP BY feedback_type
     ORDER BY total DESC, feedback_type ASC`
  );

  return {
    ...(summary || {}),
    byType,
  };
}

module.exports = {
  getDashboardSummary,
  getPlatformRevenueReport,
  getRecentBookings,
  getRecentPayments,
  getRecentValidationErrors,
  getValidationLogs,
  getValidationLogSummary,
  markValidationLogResolved,
  getValidationLogById,
  appendValidationLogReply,
  getMerchantAnalytics,
  addMerchantToFeatured,
  getFeaturedMerchantListings,
  toggleFeaturedMerchantVisibility,
  removeFeaturedMerchantListing,
  getCustomerAnalytics,
  getPendingMerchantApplications,
  getRecentMerchantValidationDecisions,
  getMerchantValidationStatusSummary,
  getMerchantApplicationTrend,
  getUserManagementSummary,
  getManagedCustomers,
  getManagedMerchants,
  setUserAccountStatus,
  setMerchantAccountStatus,
  getCustomerAccount,
  getCustomerBookingsForAdmin,
  getMerchantAccount,
  getMerchantBookingsForAdmin,
  getPlatformFeedback,
  getPlatformFeedbackSummary,
  approveMerchant,
  rejectMerchant,
};
