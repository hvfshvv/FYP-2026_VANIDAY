const db = require('../config/db');

async function getMerchantById(merchantId) {
  const [rows] = await db.query('SELECT * FROM merchant WHERE merchant_id = ?', [merchantId]);
  return rows[0] || null;
}

async function getMerchantServices(merchantId) {
  const [rows] = await db.query(
    'SELECT * FROM service WHERE merchant_id = ? AND is_active = 1',
    [merchantId]
  );
  return rows;
}

module.exports = { getMerchantById, getMerchantServices };
