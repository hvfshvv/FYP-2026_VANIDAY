const db = require('../config/db');

async function getMerchantById(merchantId) {
  const [rows] = await db.query(
    'SELECT * FROM merchant WHERE merchant_id = ?',
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

/* NEW */
async function getAllActiveMerchants() {
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
    ORDER BY m.merchant_name
  `);

  return rows;
}

module.exports = {
  getMerchantById,
  getMerchantServices,
  getAllActiveMerchants
};