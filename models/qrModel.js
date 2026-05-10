const db = require('../config/db');

async function getActiveQRByMerchant(merchantId) {
  const [rows] = await db.query(
    'SELECT * FROM QR_CODE WHERE merchant_id = ? AND is_active = 1 ORDER BY generated_at DESC LIMIT 1',
    [merchantId]
  );
  return rows[0] || null;
}

async function getQRByToken(token) {
  const [rows] = await db.query(
    'SELECT q.*, m.merchant_name, m.address FROM QR_CODE q JOIN MERCHANT m ON q.merchant_id = m.merchant_id WHERE q.qr_token = ? AND q.is_active = 1',
    [token]
  );
  return rows[0] || null;
}

async function deactivateMerchantQRs(merchantId) {
  await db.query('UPDATE QR_CODE SET is_active = 0 WHERE merchant_id = ?', [merchantId]);
}

async function insertQR(merchantId, token, imagePath) {
  const [result] = await db.query(
    'INSERT INTO QR_CODE (merchant_id, qr_token, qr_image_path) VALUES (?,?,?)',
    [merchantId, token, imagePath]
  );
  return result.insertId;
}

module.exports = { getActiveQRByMerchant, getQRByToken, deactivateMerchantQRs, insertQR };
