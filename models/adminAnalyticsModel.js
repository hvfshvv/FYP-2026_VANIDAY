/*
 * adminAnalyticsModel.js
 * Deep analytics queries for the admin merchant and customer analytics pages.
 * Aggregates booking, revenue, loyalty, review, and campaign data across
 * configurable date ranges for chart and table rendering.
 */

const db = require('../config/db');

// ── MERCHANT ANALYTICS ─────────────────────────────────────────────────────

// Returns a comprehensive merchant analytics dataset for a given date range.
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
    // Overview KPIs: bookings, revenue, conversion rate, satisfaction score.
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
       LEFT JOIN reviews r ON r.booking_id = b.booking_id AND r.review_target = 'merchant'
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
    // Revenue split by service/merchant category.
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
      `SELECT
         v.campaign_name,
         v.voucher_code,
         COUNT(DISTINCT b.booking_id) AS redemptions,
         COALESCE(SUM(CASE WHEN b.booking_id IS NOT NULL THEN b.voucher_discount_amount ELSE 0 END), 0) AS discount_given
       FROM voucher v
       LEFT JOIN customer_voucher cv ON cv.voucher_id = v.voucher_id AND cv.status = 'used'
       LEFT JOIN booking b ON b.applied_cv_id = cv.cv_id AND ${bookingDateFilter}
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
    // Peak booking times by day-of-week and hour-of-day.
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
    // Average lead time (hours between booking creation and appointment).
    db.query(
      `SELECT
         COALESCE(AVG(CASE
           WHEN CONCAT(ts.slot_date, ' ', ts.start_time) >= b.created_at
             THEN TIMESTAMPDIFF(HOUR, b.created_at, CONCAT(ts.slot_date, ' ', ts.start_time))
           ELSE NULL
         END), 0) AS avg_lead_hours,
         SUM(CASE
           WHEN CONCAT(ts.slot_date, ' ', ts.start_time) >= b.created_at THEN 1 ELSE 0
         END) AS valid_lead_count,
         SUM(CASE
           WHEN CONCAT(ts.slot_date, ' ', ts.start_time) < b.created_at THEN 1 ELSE 0
         END) AS invalid_lead_count
       FROM booking b
       JOIN time_slot ts ON ts.slot_id = b.slot_id
       WHERE ${bookingDateFilter}`,
      rangeParams
    ).then(([rows]) => rows[0] || {}),
    // Customer segmentation: new vs returning within the period.
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
       LEFT JOIN reviews r ON r.booking_id = b.booking_id AND r.review_target = 'merchant' AND DATE(r.created_at) BETWEEN ? AND ?
       WHERE ${bookingDateFilter}
       GROUP BY u.user_id, u.full_name, u.email
       ORDER BY bookings DESC, lifetime_value DESC
       LIMIT 8`,
      [...rangeParams, ...rangeParams]
    ).then(([rows]) => rows),
    db.query(
      `SELECT transaction_type, COALESCE(SUM(points_amount), 0) AS points, 0 AS cashback
       FROM transactions
       WHERE asset_type = 'points' AND DATE(created_at) BETWEEN ? AND ?
       GROUP BY transaction_type
       ORDER BY points DESC, cashback DESC`,
      rangeParams
    ).then(([rows]) => rows),
    db.query(
      `SELECT COUNT(*) AS review_count, COALESCE(AVG(rating), 0) AS average_rating
       FROM reviews
       WHERE review_target = 'merchant' AND DATE(created_at) BETWEEN ? AND ?`,
      rangeParams
    ).then(([rows]) => rows[0] || {}),
    db.query(
      `SELECT campaign_name, voucher_code, usage_limit, start_date, end_date, is_active
       FROM voucher
       ORDER BY start_date DESC
       LIMIT 8`
    ).then(([rows]) => rows),
    // Booking channel labels (WhatsApp, QR walk-in, marketplace).
    db.query(
      `SELECT
         CASE
           WHEN source = 'whatsapp' THEN 'WhatsApp booking'
           WHEN source = 'qr' AND booking_type = 'walk_in' THEN 'Walk-in QR'
           WHEN source = 'qr' THEN 'QR booking'
           WHEN COALESCE(NULLIF(source, ''), 'marketplace') IN ('web', 'marketplace') THEN 'Marketplace booking'
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
    // Financial summary: refunds, estimated tax, gross revenue.
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
    // Merchant leaderboard with featured listing status and ratings.
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
       LEFT JOIN reviews r ON r.booking_id = b.booking_id AND r.review_target = 'merchant'
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

// ── CUSTOMER ANALYTICS ─────────────────────────────────────────────────────

// Returns a comprehensive customer analytics dataset for a given date range.
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
    staffPerformance,
    paymentMethods,
  ] = await Promise.all([
    // Overview KPIs: customer counts, loyalty balances, spending totals.
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
       LEFT JOIN wallet lw ON lw.customer_id = u.user_id
       LEFT JOIN favourite f ON f.customer_id = u.user_id
       LEFT JOIN booking b ON b.customer_id = u.user_id AND ${bookingDateFilter}
       LEFT JOIN payment p ON p.booking_id = b.booking_id
       WHERE u.role = 'customer'`,
      rangeParams
    ).then(([rows]) => rows[0] || {}),
    // Top 10 customer profiles by spending for the period.
    db.query(
      `SELECT
         u.user_id,
         u.full_name,
         u.email,
         u.phone,
         NULL AS date_of_birth,
         u.status,
         u.created_at,
         COALESCE(lw.points_balance, 0) AS points_balance,
         COALESCE(lw.lifetime_points_earned, 0) AS lifetime_points_earned,
         COALESCE(lw.lifetime_points_redeemed, 0) AS lifetime_points_redeemed,
         COUNT(DISTINCT b.booking_id) AS bookings,
         COALESCE(SUM(CASE WHEN p.payment_status = 'paid' THEN p.amount ELSE 0 END), 0) AS total_spent,
         COUNT(DISTINCT f.favourite_id) AS favourites
       FROM users u
       LEFT JOIN wallet lw ON lw.customer_id = u.user_id
       LEFT JOIN booking b ON b.customer_id = u.user_id AND ${bookingDateFilter}
       LEFT JOIN payment p ON p.booking_id = b.booking_id
       LEFT JOIN favourite f ON f.customer_id = u.user_id
       WHERE u.role = 'customer'
       GROUP BY u.user_id, u.full_name, u.email, u.phone, u.status, u.created_at,
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
         AND DATE(ts.slot_date) BETWEEN ? AND ?
         AND CONCAT(ts.slot_date, ' ', ts.start_time) >= NOW()
       ORDER BY ts.slot_date ASC, ts.start_time ASC
       LIMIT 8`,
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
         AND DATE(ts.slot_date) BETWEEN ? AND ?
         AND (CONCAT(ts.slot_date, ' ', ts.start_time) < NOW() OR b.status IN ('completed', 'cancelled', 'no_show'))
       ORDER BY ts.slot_date DESC, ts.start_time DESC
       LIMIT 8`,
      rangeParams
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
    // Loyalty wallet totals and tier breakdown across all customers.
    db.query(
      `SELECT
         COALESCE(SUM(points_balance), 0) AS points_balance,
         COALESCE(SUM(money_balance), 0) AS money_balance,
         COALESCE(SUM(lifetime_points_earned), 0) AS points_earned,
         COALESCE(SUM(lifetime_points_redeemed), 0) AS points_redeemed,
         SUM(CASE WHEN points_balance >= 2000 THEN 1 ELSE 0 END) AS gold_members,
         SUM(CASE WHEN points_balance >= 800 AND points_balance < 2000 THEN 1 ELSE 0 END) AS silver_members,
         SUM(CASE WHEN points_balance < 800 THEN 1 ELSE 0 END) AS bronze_members
       FROM wallet`
    ).then(([rows]) => rows[0] || {}),
    db.query(
      `SELECT lt.transaction_type, COALESCE(SUM(lt.points_amount), 0) AS points, 0 AS cashback
       FROM transactions lt
       WHERE lt.asset_type = 'points' AND DATE(lt.created_at) BETWEEN ? AND ?
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
    // Customer spending split by service/merchant category.
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
    // Booking frequency by day-of-week for the recommendation section.
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
       LEFT JOIN booking b ON b.merchant_id = m.merchant_id AND DATE(b.created_at) BETWEEN ? AND ?
       LEFT JOIN reviews r ON r.merchant_id = m.merchant_id AND r.review_target = 'merchant'
       GROUP BY m.merchant_id, m.merchant_name, m.category
       ORDER BY bookings DESC, rating DESC
       LIMIT 8`,
      rangeParams
    ).then(([rows]) => rows),
    db.query(
      `SELECT s.service_name, m.merchant_name, COALESCE(NULLIF(s.category, ''), NULLIF(m.category, ''), 'Uncategorised') AS category,
              COUNT(b.booking_id) AS bookings
       FROM service s
       JOIN merchant m ON m.merchant_id = s.merchant_id
       LEFT JOIN booking b ON b.service_id = s.service_id AND DATE(b.created_at) BETWEEN ? AND ?
       WHERE s.is_active = TRUE
       GROUP BY s.service_id, s.service_name, s.category, m.merchant_name, m.category
       ORDER BY bookings DESC
       LIMIT 8`,
      rangeParams
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
       FROM reviews
       WHERE review_target = 'merchant' AND DATE(created_at) BETWEEN ? AND ?`,
      rangeParams
    ).then(([rows]) => rows[0] || {}),
    db.query(
      `SELECT r.review_id, r.rating, r.review_text, r.created_at,
              u.full_name AS customer_name, m.merchant_name, s.service_name
       FROM reviews r
       JOIN users u ON u.user_id = r.customer_id
       JOIN merchant m ON m.merchant_id = r.merchant_id
       JOIN service s ON s.service_id = r.service_id
       WHERE r.review_target = 'merchant' AND DATE(r.created_at) BETWEEN ? AND ?
       ORDER BY r.created_at DESC
       LIMIT 8`,
      rangeParams
    ).then(([rows]) => rows),
    db.query(
      `SELECT feedback_type, COUNT(*) AS total, COALESCE(AVG(rating), 0) AS avg_rating
       FROM reviews
       WHERE review_target = 'platform' AND DATE(created_at) BETWEEN ? AND ?
       GROUP BY feedback_type
       ORDER BY total DESC`,
      rangeParams
    ).then(([rows]) => rows),
    // Security overview: active vs suspended customer accounts.
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
      `SELECT
         COALESCE(st.staff_id, 0) AS staff_id,
         COALESCE(st.full_name, 'Unassigned') AS staff_name,
         COALESCE(st.role, 'No role recorded') AS staff_role,
         COALESCE(m.merchant_name, 'Unknown merchant') AS merchant_name,
         COUNT(DISTINCT b.booking_id) AS bookings,
         COUNT(DISTINCT b.customer_id) AS customers,
         SUM(CASE WHEN b.status = 'completed' THEN 1 ELSE 0 END) AS completed_bookings,
         SUM(CASE WHEN b.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_bookings,
         COALESCE(SUM(CASE WHEN p.payment_status = 'paid' THEN p.amount ELSE 0 END), 0) AS revenue,
         COALESCE(AVG(CASE WHEN p.payment_status = 'paid' THEN p.amount END), 0) AS average_paid_booking
       FROM booking b
       JOIN users u ON u.user_id = b.customer_id
       LEFT JOIN staff st ON st.staff_id = b.staff_id
       LEFT JOIN merchant m ON m.merchant_id = b.merchant_id
       LEFT JOIN payment p ON p.booking_id = b.booking_id
       WHERE u.role = 'customer' AND ${bookingDateFilter}
       GROUP BY COALESCE(st.staff_id, 0), COALESCE(st.full_name, 'Unassigned'),
                COALESCE(st.role, 'No role recorded'), COALESCE(m.merchant_name, 'Unknown merchant')
       ORDER BY bookings DESC, revenue DESC
       LIMIT 10`,
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
    staffPerformance,
    paymentMethods,
  };
}

module.exports = {
  getMerchantAnalytics,
  getCustomerAnalytics,
};
