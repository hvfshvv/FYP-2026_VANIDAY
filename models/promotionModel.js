const db = require('../config/db');

let schemaReady = false;

async function columnExists(columnName) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'promotion'
       AND COLUMN_NAME = ?`,
    [columnName]
  );

  return Number(rows[0]?.count || 0) > 0;
}

async function addColumnIfMissing(columnName, ddl) {
  if (await columnExists(columnName)) return;
  console.warn(`[promotion] Missing column ${columnName}; applying safe schema patch.`);
  try {
    await db.query(`ALTER TABLE promotion ADD COLUMN ${ddl}`);
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') return;
    throw err;
  }
}

async function ensurePromotionSchema() {
  if (schemaReady) return;

  // Add promotion approval fields if the database is missing them.
  await addColumnIfMissing('service_id', 'service_id INT NULL AFTER merchant_id');
  await addColumnIfMissing('discount_pct', 'discount_pct DECIMAL(5,2) NULL AFTER description');
  await addColumnIfMissing('offer_text', 'offer_text VARCHAR(150) NULL AFTER discount_pct');
  await addColumnIfMissing('applicable_days', 'applicable_days VARCHAR(50) NULL AFTER offer_text');
  await addColumnIfMissing('approval_status', "approval_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'approved' AFTER is_active");
  await addColumnIfMissing('submitted_by_merchant', 'submitted_by_merchant BOOLEAN NOT NULL DEFAULT TRUE AFTER approval_status');
  await addColumnIfMissing('rejection_reason', 'rejection_reason TEXT NULL AFTER submitted_by_merchant');
  await addColumnIfMissing('approved_by_admin_id', 'approved_by_admin_id INT NULL AFTER rejection_reason');
  await addColumnIfMissing('approved_at', 'approved_at DATETIME NULL AFTER approved_by_admin_id');
  await addColumnIfMissing('submitted_at', 'submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP AFTER approved_at');
  await addColumnIfMissing('min_spend', 'min_spend DECIMAL(10,2) NULL AFTER discount_pct');

  await db.query(
    `UPDATE promotion
     SET approval_status = COALESCE(approval_status, 'approved'),
         submitted_by_merchant = COALESCE(submitted_by_merchant, 1)`
  );

  schemaReady = true;
}

async function createPromotion({
  merchantId,
  serviceId = null,
  title,
  description,
  discountPct,
  minSpend = null,
  offerText,
  applicableDays = null,
  imagePath = null,
  startDate,
  endDate,
}) {
  await ensurePromotionSchema();

  // New merchant promotions wait for admin approval first.
  const [result] = await db.query(
    `INSERT INTO promotion
      (merchant_id, service_id, title, description, discount_pct, min_spend, offer_text, applicable_days, image_path,
       start_date, end_date, is_active, approval_status, submitted_by_merchant)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending', 1)`,
    [
      merchantId,
      serviceId || null,
      title,
      description || null,
      discountPct,
      minSpend || null,
      offerText || null,
      applicableDays || null,
      imagePath || null,
      startDate,
      endDate,
    ]
  );
  return result.insertId;
}

async function getMerchantPromotions(merchantId) {
  await ensurePromotionSchema();

  const [rows] = await db.query(
    `SELECT p.*, s.service_name
     FROM promotion p
     LEFT JOIN service s ON p.service_id = s.service_id
     WHERE p.merchant_id = ?
     ORDER BY p.submitted_at DESC, p.start_date DESC, p.promo_id DESC`,
    [merchantId]
  );
  return rows;
}

async function getMerchantApprovedPromotions(merchantId) {
  await ensurePromotionSchema();

  const [rows] = await db.query(
    `SELECT p.*, s.service_name
     FROM promotion p
     LEFT JOIN service s ON p.service_id = s.service_id
     WHERE p.merchant_id = ?
       AND p.approval_status = 'approved'
       AND p.is_active = 1
       AND p.discount_pct > 0
       AND p.start_date <= CURDATE()
       AND p.end_date >= CURDATE()
       AND (
         p.applicable_days IS NULL
         OR p.applicable_days = ''
         OR FIND_IN_SET(LOWER(DATE_FORMAT(CURDATE(), '%a')), p.applicable_days) > 0
       )
     ORDER BY p.start_date DESC, p.promo_id DESC`,
    [merchantId]
  );
  return rows;
}

async function getMerchantApprovedPromotionById(promoId, merchantId) {
  await ensurePromotionSchema();

  const [rows] = await db.query(
    `SELECT promo_id
     FROM promotion
     WHERE promo_id = ?
       AND merchant_id = ?
       AND approval_status = 'approved'
       AND is_active = 1
       AND discount_pct > 0
       AND start_date <= CURDATE()
       AND end_date >= CURDATE()
       AND (
         applicable_days IS NULL
         OR applicable_days = ''
         OR FIND_IN_SET(LOWER(DATE_FORMAT(CURDATE(), '%a')), applicable_days) > 0
       )
     LIMIT 1`,
    [promoId, merchantId]
  );
  return rows[0] || null;
}

async function getActivePromotions(category = null) {
  await ensurePromotionSchema();

  const params = [];
  let categoryFilter = '';

  if (category) {
    categoryFilter = ' AND LOWER(m.category) = LOWER(?)';
    params.push(category);
  }

  // Show only approved promotions that are active today.
  const [rows] = await db.query(
    `SELECT p.*, m.merchant_name, m.category, s.service_name
     FROM promotion p
     JOIN merchant m ON p.merchant_id = m.merchant_id
     LEFT JOIN service s ON p.service_id = s.service_id
     WHERE p.is_active = 1
       AND p.approval_status = 'approved'
       AND p.discount_pct > 0
       AND p.start_date <= CURDATE()
       AND p.end_date >= CURDATE()
       AND (
         p.applicable_days IS NULL
         OR p.applicable_days = ''
         OR FIND_IN_SET(LOWER(DATE_FORMAT(CURDATE(), '%a')), p.applicable_days) > 0
       )
       AND m.is_active = 1
       AND m.verification_status = 'approved'
       ${categoryFilter}
     ORDER BY p.start_date DESC`,
    params
  );
  return rows;
}

async function togglePromotion(promoId, merchantId) {
  await ensurePromotionSchema();

  // Only approved promotions can be switched live or paused.
  await db.query(
    `UPDATE promotion
     SET is_active = NOT is_active
     WHERE promo_id = ?
       AND merchant_id = ?
       AND approval_status = 'approved'`,
    [promoId, merchantId]
  );
}

async function deletePromotion(promoId, merchantId) {
  await ensurePromotionSchema();

  await db.query(
    'DELETE FROM promotion WHERE promo_id = ? AND merchant_id = ?',
    [promoId, merchantId]
  );
}

async function getPendingPromotionRequests() {
  await ensurePromotionSchema();

  // Load merchant promotion requests waiting for admin review.
  const [rows] = await db.query(
    `SELECT p.*, m.merchant_name, m.email AS merchant_email, s.service_name
     FROM promotion p
     JOIN merchant m ON p.merchant_id = m.merchant_id
     LEFT JOIN service s ON p.service_id = s.service_id
     WHERE p.approval_status = 'pending'
     ORDER BY p.submitted_at ASC, p.promo_id ASC`
  );

  return rows;
}

async function approvePromotion(promoId, adminId) {
  await ensurePromotionSchema();

  // Approve and publish the merchant promotion.
  const [result] = await db.query(
    `UPDATE promotion
     SET approval_status = 'approved',
         is_active = 1,
         rejection_reason = NULL,
         approved_by_admin_id = ?,
         approved_at = NOW()
     WHERE promo_id = ?
       AND approval_status = 'pending'`,
    [adminId, promoId]
  );

  return result.affectedRows;
}

async function rejectPromotion(promoId, adminId, reason = null) {
  await ensurePromotionSchema();

  // Reject promotion and keep it hidden from marketplace.
  const [result] = await db.query(
    `UPDATE promotion
     SET approval_status = 'rejected',
         is_active = 0,
         rejection_reason = ?,
         approved_by_admin_id = ?,
         approved_at = NOW()
     WHERE promo_id = ?
       AND approval_status = 'pending'`,
    [reason || null, adminId, promoId]
  );

  return result.affectedRows;
}

async function getApplicablePromotionForBooking({ merchantId, serviceId, bookingDate, baseAmount = 0 }) {
  await ensurePromotionSchema();

  // Derive 3-letter weekday abbreviation from the booking date (e.g. "wed").
  const dayAbbr = new Date(bookingDate + 'T00:00:00')
    .toLocaleDateString('en-US', { weekday: 'short' })
    .toLowerCase();

  const [rows] = await db.query(
    `SELECT p.*
     FROM promotion p
     WHERE p.merchant_id = ?
       AND p.is_active = 1
       AND p.approval_status = 'approved'
       AND p.discount_pct > 0
       AND p.start_date <= ?
       AND p.end_date >= ?
       AND (p.service_id IS NULL OR p.service_id = ?)
       AND (
         p.applicable_days IS NULL
         OR p.applicable_days = ''
         OR FIND_IN_SET(?, p.applicable_days) > 0
       )
       AND (p.min_spend IS NULL OR p.min_spend = 0 OR ? >= p.min_spend)
     ORDER BY p.discount_pct DESC
     LIMIT 1`,
    [merchantId, bookingDate, bookingDate, serviceId || null, dayAbbr, baseAmount]
  );

  return rows[0] || null;
}

module.exports = {
  createPromotion,
  getMerchantPromotions,
  getMerchantApprovedPromotions,
  getMerchantApprovedPromotionById,
  getActivePromotions,
  getApplicablePromotionForBooking,
  togglePromotion,
  deletePromotion,
  getPendingPromotionRequests,
  approvePromotion,
  rejectPromotion,
  ensurePromotionSchema,
};
