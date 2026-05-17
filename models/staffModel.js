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

async function addStaff(
  merchantId,
  fullName,
  role,
  bio,
  experienceYears,
  serviceIds = []
) {

  const [result] = await db.query(
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

  const staffId = result.insertId;

  if (!Array.isArray(serviceIds)) {
    serviceIds = [serviceIds];
  }

  for (const serviceId of serviceIds) {
    await db.query(
      `INSERT INTO staff_service (staff_id, service_id)
       VALUES (?, ?)`,
      [staffId, serviceId]
    );
  }
}

async function updateStaff(staffId, merchantId, fullName, role, bio, experienceYears) {
  await db.query(
    `UPDATE staff
     SET full_name = ?,
         role = ?,
         bio = ?,
         experience_years = ?
     WHERE staff_id = ?
     AND merchant_id = ?`,
    [fullName, role, bio, experienceYears || 0, staffId, merchantId]
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

async function getStaffByService(serviceId, merchantId) {

  const [rows] = await db.query(
    `
    SELECT DISTINCT s.*
    FROM staff s
    JOIN staff_service ss
      ON s.staff_id = ss.staff_id
    WHERE ss.service_id = ?
    AND s.merchant_id = ?
    AND s.is_active = 1
    ORDER BY s.full_name ASC
    `,
    [serviceId, merchantId]
  );

  return rows;
}

module.exports = {
  getStaffByMerchant,
  addStaff,
  updateStaff,
  toggleStaff,
  deleteStaff,
  getStaffByService
};