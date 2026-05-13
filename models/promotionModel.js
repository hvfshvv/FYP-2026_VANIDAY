const db = require('../config/db');

async function createPromotion({ merchantId, title, description, startDate, endDate }) {
  const [result] = await db.query(
    'INSERT INTO promotion (merchant_id, title, description, start_date, end_date) VALUES (?,?,?,?,?)',
    [merchantId, title, description, startDate, endDate]
  );
  return result.insertId;
}

async function getMerchantPromotions(merchantId) {
  const [rows] = await db.query(
    'SELECT * FROM promotion WHERE merchant_id = ? ORDER BY start_date DESC',
    [merchantId]
  );
  return rows;
}

async function getActivePromotions(category = null) {
  const params = [];
  let categoryFilter = '';

  if (category) {
    categoryFilter = ' AND LOWER(m.category) = LOWER(?)';
    params.push(category);
  }

  const [rows] = await db.query(
    `SELECT p.*, m.merchant_name, m.category
     FROM promotion p
     JOIN merchant m ON p.merchant_id = m.merchant_id
     WHERE p.is_active = 1 AND p.start_date <= CURDATE() AND p.end_date >= CURDATE()
       ${categoryFilter}
     ORDER BY p.start_date DESC`,
    params
  );
  return rows;
}

async function togglePromotion(promoId, merchantId) {
  await db.query(
    'UPDATE promotion SET is_active = NOT is_active WHERE promo_id = ? AND merchant_id = ?',
    [promoId, merchantId]
  );
}

async function deletePromotion(promoId, merchantId) {
  await db.query(
    'DELETE FROM promotion WHERE promo_id = ? AND merchant_id = ?',
    [promoId, merchantId]
  );
}

module.exports = { createPromotion, getMerchantPromotions, getActivePromotions, togglePromotion, deletePromotion };
