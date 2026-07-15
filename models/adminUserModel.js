/*
 * adminUserModel.js
 * Manages user and merchant accounts from the admin panel: listing, searching,
 * enabling/disabling accounts, fetching booking histories, handling merchant
 * verification decisions, featured listings, and platform feedback.
 */

const db = require('../config/db');
const { withResolvedMerchantImage } = require('../utils/merchantImages');

// ── SHARED HELPERS ─────────────────────────────────────────────────────────

// Writes a structured admin action entry for audit trail purposes.
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

// Builds a SQL WHERE clause fragment and params array for a keyword search across columns.
function searchClause(search, columns) {
  const term = String(search || '').trim();
  if (!term) return { clause: '', params: [] };

  return {
    clause: ` AND (${columns.map(column => `${column} LIKE ?`).join(' OR ')})`,
    params: columns.map(() => `%${term}%`),
  };
}

// ── USER MANAGEMENT SUMMARY ────────────────────────────────────────────────

// Returns customer and merchant account counts for the user management landing cards.
async function getUserManagementSummary() {
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

// ── CUSTOMER MANAGEMENT ────────────────────────────────────────────────────

// Returns customer accounts with booking totals, tier, and loyalty balance — supports keyword search.
async function getManagedCustomers(search = '') {
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
       FROM wallet
       GROUP BY customer_id
     ) ls ON ls.customer_id = u.user_id
     WHERE u.role = 'customer'
       ${filter.clause}
     ORDER BY u.user_id ASC`,
    filter.params
  );

  return rows;
}

// Returns merchant accounts with revenue totals and verification status — supports search and filter.
async function getManagedMerchants(search = '', verification = 'all') {
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

// ── ACCOUNT STATUS UPDATES ─────────────────────────────────────────────────

// Enables or disables a customer account and logs the admin action.
async function setUserAccountStatus(userId, status, adminId, reason = null) {
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

// Enables or disables a merchant, keeping merchant.is_active and users.status in sync.
async function setMerchantAccountStatus(merchantId, enabled, adminId, reason = null) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Lock the merchant row before reading user_id to prevent races.
    const [[merchant]] = await connection.query(
      `SELECT user_id FROM merchant WHERE merchant_id = ? FOR UPDATE`,
      [merchantId]
    );

    if (!merchant) {
      await connection.rollback();
      return 0;
    }

    await connection.query(
      `UPDATE merchant SET is_active = ? WHERE merchant_id = ?`,
      [enabled ? 1 : 0, merchantId]
    );

    await connection.query(
      `UPDATE users SET status = ? WHERE user_id = ?`,
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

// ── CUSTOMER / MERCHANT DETAIL PAGES ──────────────────────────────────────

// Returns a single customer record for the admin booking detail page header.
async function getCustomerAccount(customerId) {
  const [rows] = await db.query(
    `SELECT user_id, full_name, email, phone, status, created_at
     FROM users
     WHERE user_id = ?
       AND role = 'customer'`,
    [customerId]
  );

  return rows[0] || null;
}

// Returns full booking history for one customer including payment and service details.
async function getCustomerBookingsForAdmin(customerId) {
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

// Returns a single merchant record with linked owner details for the admin booking detail header.
async function getMerchantAccount(merchantId) {
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

// Returns full booking history for one merchant including customer and payment details.
async function getMerchantBookingsForAdmin(merchantId) {
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
     LEFT JOIN users c ON c.user_id = b.customer_id
     LEFT JOIN payment p ON p.booking_id = b.booking_id
     WHERE b.merchant_id = ?
     ORDER BY ts.slot_date DESC, ts.start_time DESC`,
    [merchantId]
  );

  return rows;
}

// ── PLATFORM FEEDBACK ──────────────────────────────────────────────────────

// Returns filtered platform feedback entries with linked booking and merchant context.
async function getPlatformFeedback({ type = 'all', rating = 'all', search = '' } = {}) {
  const params = [];
  const clauses = ["pf.review_target = 'platform'"];

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
    'pf.review_text',
  ]);
  if (filter.clause) {
    clauses.push(filter.clause.replace(/^\s*AND\s+/i, ''));
    params.push(...filter.params);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const [rows] = await db.query(
    `SELECT
       pf.review_id AS feedback_id,
       pf.booking_id,
       pf.customer_id,
       pf.rating,
       pf.feedback_type,
       pf.review_text AS feedback_text,
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
     FROM reviews pf
     JOIN users u ON u.user_id = pf.customer_id
     LEFT JOIN booking b ON b.booking_id = pf.booking_id
     LEFT JOIN time_slot ts ON ts.slot_id = b.slot_id
     LEFT JOIN merchant m ON m.merchant_id = b.merchant_id
     LEFT JOIN service s ON s.service_id = b.service_id
     ${whereSql}
     ORDER BY pf.created_at DESC, pf.review_id DESC`,
    params
  );

  return rows;
}

// Returns aggregate feedback stats (count, average rating, breakdown by type).
async function getPlatformFeedbackSummary() {
  const [[summary]] = await db.query(
    `SELECT
       COUNT(*) AS total_feedback,
       COALESCE(AVG(rating), 0) AS average_rating,
       SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) AS positive_count,
       SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) AS low_rating_count
     FROM reviews
     WHERE review_target = 'platform'`
  );

  const [byType] = await db.query(
    `SELECT feedback_type, COUNT(*) AS total, COALESCE(AVG(rating), 0) AS average_rating
     FROM reviews
     WHERE review_target = 'platform'
     GROUP BY feedback_type
     ORDER BY total DESC, feedback_type ASC`
  );

  return {
    ...(summary || {}),
    byType,
  };
}

// ── MERCHANT VERIFICATION ──────────────────────────────────────────────────

// Returns all merchants with a pending verification status awaiting admin review.
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

// Returns recently approved/rejected merchant decisions for the decisions panel.
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

// Returns counts of merchants in each verification status for the summary badges.
async function getMerchantValidationStatusSummary() {
  const [rows] = await db.query(
    `SELECT verification_status, COUNT(*) AS total
     FROM merchant
     GROUP BY verification_status`
  );

  const summary = { pending: 0, approved: 0, rejected: 0 };

  rows.forEach(row => {
    if (Object.prototype.hasOwnProperty.call(summary, row.verification_status)) {
      summary[row.verification_status] = row.total;
    }
  });

  return summary;
}

// Approves a pending merchant application and records the admin decision.
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

// Rejects a pending merchant application with optional notes and records the admin decision.
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

// ── FEATURED LISTINGS ──────────────────────────────────────────────────────

// Creates or re-activates a featured listing for a merchant from the analytics leaderboard.
async function addMerchantToFeatured(merchantId) {
  const [[merchant]] = await db.query(
    `SELECT merchant_id, merchant_name, category FROM merchant WHERE merchant_id = ?`,
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
      `UPDATE featured_listing SET title = ?, description = ?, is_visible = TRUE WHERE merchant_id = ?`,
      [title, description, merchantId]
    );
    return existing[0].listing_id;
  }

  const [result] = await db.query(
    `INSERT INTO featured_listing (merchant_id, title, description, is_visible) VALUES (?, ?, ?, TRUE)`,
    [merchantId, title, description]
  );

  return result.insertId;
}

// Returns all featured listings with booking stats, rating, and resolved image path.
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
     LEFT JOIN reviews r ON r.booking_id = b.booking_id AND r.review_target = 'merchant'
     GROUP BY
       fl.listing_id, fl.merchant_id, fl.title, fl.description,
       fl.display_order, fl.is_visible, fl.created_at,
       m.merchant_name, m.category, fl.image_path, m.profile_image
     ORDER BY fl.is_visible DESC, fl.display_order ASC, revenue DESC, fl.created_at DESC`
  );

  return rows.map(withResolvedMerchantImage);
}

// Flips the visibility flag on a featured listing.
async function toggleFeaturedMerchantVisibility(listingId) {
  await db.query(
    'UPDATE featured_listing SET is_visible = NOT is_visible WHERE listing_id = ?',
    [listingId]
  );
}

// Permanently removes a featured listing.
async function removeFeaturedMerchantListing(listingId) {
  await db.query(
    'DELETE FROM featured_listing WHERE listing_id = ?',
    [listingId]
  );
}

module.exports = {
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
  getPendingMerchantApplications,
  getRecentMerchantValidationDecisions,
  getMerchantValidationStatusSummary,
  approveMerchant,
  rejectMerchant,
  addMerchantToFeatured,
  getFeaturedMerchantListings,
  toggleFeaturedMerchantVisibility,
  removeFeaturedMerchantListing,
  logAdminAction,
  searchClause,
};
