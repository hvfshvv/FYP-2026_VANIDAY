const db = require('../config/db');

async function createPromotion({
  merchantId,
  serviceId = null,
  title,
  description,
  discountPct,
  offerText,
  imagePath = null,
  startDate,
  endDate,
}) {
  const [result] = await db.query(
    `INSERT INTO promotion
      (merchant_id, service_id, title, description, discount_pct, offer_text, image_path,
       start_date, end_date, is_active, approval_status, submitted_by_merchant)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending', 1)`,
    [
      merchantId,
      serviceId || null,
      title,
      description || null,
      discountPct,
      offerText || null,
      imagePath || null,
      startDate,
      endDate,
    ]
  );
  return result.insertId;
}

async function getMerchantPromotions(merchantId) {
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
  const [rows] = await db.query(
    `SELECT p.*, s.service_name
     FROM promotion p
     LEFT JOIN service s ON p.service_id = s.service_id
     WHERE p.merchant_id = ?
       AND p.approval_status = 'approved'
       AND p.is_active = 1
       AND p.start_date <= CURDATE()
       AND p.end_date >= CURDATE()
     ORDER BY p.start_date DESC, p.promo_id DESC`,
    [merchantId]
  );
  return rows;
}

async function getMerchantApprovedPromotionById(promoId, merchantId) {
  const [rows] = await db.query(
    `SELECT promo_id
     FROM promotion
     WHERE promo_id = ?
       AND merchant_id = ?
       AND approval_status = 'approved'
       AND is_active = 1
       AND start_date <= CURDATE()
       AND end_date >= CURDATE()
     LIMIT 1`,
    [promoId, merchantId]
  );
  return rows[0] || null;
}

async function getActivePromotions(category = null) {
  const params = [];
  let categoryFilter = '';

  if (category) {
    categoryFilter = ' AND LOWER(m.category) = LOWER(?)';
    params.push(category);
  }

  const [rows] = await db.query(
    `SELECT p.*, m.merchant_name, m.category, s.service_name
     FROM promotion p
     JOIN merchant m ON p.merchant_id = m.merchant_id
     LEFT JOIN service s ON p.service_id = s.service_id
     WHERE p.is_active = 1
       AND p.approval_status = 'approved'
       AND p.start_date <= CURDATE()
       AND p.end_date >= CURDATE()
       AND m.is_active = 1
       AND m.verification_status = 'approved'
       ${categoryFilter}
     ORDER BY p.start_date DESC`,
    params
  );
  return rows;
}

async function togglePromotion(promoId, merchantId) {
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
  await db.query(
    'DELETE FROM promotion WHERE promo_id = ? AND merchant_id = ?',
    [promoId, merchantId]
  );
}

async function getPendingPromotionRequests() {
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

module.exports = {
  createPromotion,
  getMerchantPromotions,
  getMerchantApprovedPromotions,
  getMerchantApprovedPromotionById,
  getActivePromotions,
  togglePromotion,
  deletePromotion,
  getPendingPromotionRequests,
  approvePromotion,
  rejectPromotion,
};
