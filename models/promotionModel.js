const db = require('../config/db');

async function createPromotion({ merchantId, title, description, discountPct, startDate, endDate }) {
  const [result] = await db.query(
    'INSERT INTO PROMOTION (merchant_id, title, description, discount_pct, start_date, end_date) VALUES (?,?,?,?,?,?)',
    [merchantId, title, description, discountPct, startDate, endDate]
  );
  return result.insertId;
}

async function getMerchantPromotions(merchantId) {
  const [rows] = await db.query(
    'SELECT * FROM PROMOTION WHERE merchant_id = ? ORDER BY start_date DESC',
    [merchantId]
  );
  return rows;
}

async function getActivePromotions() {
  const [rows] = await db.query(
    `SELECT p.*, m.merchant_name FROM PROMOTION p
     JOIN MERCHANT m ON p.merchant_id = m.merchant_id
     WHERE p.is_active = 1 AND p.start_date <= CURDATE() AND p.end_date >= CURDATE()
     ORDER BY p.start_date DESC`
  );
  return rows;
}

async function togglePromotion(promoId, merchantId) {
  await db.query(
    'UPDATE PROMOTION SET is_active = NOT is_active WHERE promo_id = ? AND merchant_id = ?',
    [promoId, merchantId]
  );
}

async function deletePromotion(promoId, merchantId) {
  await db.query(
    'DELETE FROM PROMOTION WHERE promo_id = ? AND merchant_id = ?',
    [promoId, merchantId]
  );
}

module.exports = { createPromotion, getMerchantPromotions, getActivePromotions, togglePromotion, deletePromotion };
