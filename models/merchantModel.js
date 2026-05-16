const db = require('../config/db');

async function getMerchantById(merchantId) {
  const [rows] = await db.query(
    `SELECT *
     FROM merchant
     WHERE merchant_id = ?
       AND is_active = 1
       AND verification_status = 'approved'`,
    [merchantId]
  );

  return rows[0] || null;
}

async function getMerchantServices(merchantId) {
  const [rows] = await db.query(
    'SELECT * FROM service WHERE merchant_id = ? AND is_active = 1',
    [merchantId]
  );

  return rows;
}

async function getAllActiveMerchants(category = null) {
  const params = [];
  let categoryFilter = '';

  if (category) {
    categoryFilter = ' AND LOWER(m.category) = LOWER(?)';
    params.push(category);
  }

  const [rows] = await db.query(`
    SELECT
      m.merchant_id,
      m.merchant_name,
      m.description,
      m.category,
      m.address,
      m.contact_no,
      fl.image_path
    FROM merchant m
    LEFT JOIN featured_listing fl
      ON m.merchant_id = fl.merchant_id
    WHERE m.is_active = 1
      AND m.verification_status = 'approved'
      ${categoryFilter}
    ORDER BY m.merchant_name
  `, params);

  return rows;
}

module.exports = {
  getMerchantById,
  getMerchantServices,
  getAllActiveMerchants
};
