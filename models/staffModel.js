const db = require('../config/db');

async function getStaffByMerchant(merchantId) {
  const [rows] = await db.query(
    `SELECT *
     FROM staff
     WHERE merchant_id = ?
     ORDER BY is_active DESC, full_name ASC`,
    [merchantId]
  );

  return rows;
}

async function addStaff(merchantId, fullName, role, bio, experienceYears) {
  await db.query(
    `INSERT INTO staff
      (merchant_id, full_name, role, bio, experience_years, is_active)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [
      merchantId,
      fullName,
      role || null,
      bio || null,
      experienceYears || null
    ]
  );
}

async function toggleStaff(staffId, merchantId) {
  await db.query(
    `UPDATE staff
     SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END
     WHERE staff_id = ? AND merchant_id = ?`,
    [staffId, merchantId]
  );
}

async function deleteStaff(staffId, merchantId) {
  await db.query(
    `DELETE FROM staff
     WHERE staff_id = ? AND merchant_id = ?`,
    [staffId, merchantId]
  );
}

module.exports = {
  getStaffByMerchant,
  addStaff,
  toggleStaff,
  deleteStaff
};