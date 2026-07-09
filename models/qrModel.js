const db = require('../config/db');

function normalizeQRType(type) {
  return type === 'check_in' ? 'check_in' : 'booking';
}

async function getActiveQRByMerchant(merchantId, type = 'booking') {
  const qrType = normalizeQRType(type);
  // Get the latest active QR code for this merchant.
  const [rows] = await db.query(
    `SELECT q.*, m.merchant_name, m.address
     FROM qr_code q
     JOIN merchant m ON q.merchant_id = m.merchant_id
     WHERE q.merchant_id = ?
       AND q.qr_type = ?
       AND q.is_active = 1
     ORDER BY q.generated_at DESC, q.qr_id DESC
     LIMIT 1`,
    [merchantId, qrType]
  );
  return rows[0] || null;
}

async function getQRByToken(token, type = 'booking') {
  const qrType = normalizeQRType(type);
  // Accept scans only from active QR codes owned by approved merchants.
  const [rows] = await db.query(
    `SELECT q.*, m.merchant_name, m.address
     FROM qr_code q
     JOIN merchant m ON q.merchant_id = m.merchant_id
     WHERE q.qr_token = ?
       AND q.qr_type = ?
       AND q.is_active = 1
       AND m.is_active = 1
       AND m.verification_status = 'approved'`,
    [token, qrType]
  );
  return rows[0] || null;
}

async function getQRByTokenIncludingInactive(token) {
  const [rows] = await db.query(
    'SELECT * FROM qr_code WHERE qr_token = ? LIMIT 1',
    [token]
  );
  return rows[0] || null;
}

async function deactivateMerchantQRs(merchantId, type = 'booking') {
  const qrType = normalizeQRType(type);
  // Turn off old QR codes before a new one goes live.
  await db.query(
    `UPDATE qr_code
     SET is_active = 0
     WHERE merchant_id = ?
       AND qr_type = ?`,
    [merchantId, qrType]
  );
}

async function insertQR(merchantId, token, imagePath, qrUrl, type = 'booking') {
  const qrType = normalizeQRType(type);
  // Save the generated QR token, URL, and image path.
  const [result] = await db.query(
    'INSERT INTO qr_code (merchant_id, qr_token, qr_url, qr_image_path, qr_type) VALUES (?,?,?,?,?)',
    [merchantId, token, qrUrl, imagePath, qrType]
  );
  return result.insertId;
}

async function updateQRUrl(qrId, qrUrl) {
  await db.query(
    'UPDATE qr_code SET qr_url = ? WHERE qr_id = ?',
    [qrUrl, qrId]
  );
}

module.exports = {
  getActiveQRByMerchant,
  getQRByToken,
  getQRByTokenIncludingInactive,
  deactivateMerchantQRs,
  insertQR,
  updateQRUrl,
};
