const db = require('../config/db');

async function getStaffByMerchant(merchantId) {
  const [rows] = await db.query(
    `SELECT s.*,
            GROUP_CONCAT(ss.service_id ORDER BY ss.service_id) AS service_ids
     FROM staff s
     LEFT JOIN staff_service ss ON ss.staff_id = s.staff_id
     WHERE s.merchant_id = ?
     GROUP BY s.staff_id
     ORDER BY s.is_active DESC, s.full_name ASC`,
    [merchantId]
  );

  return rows.map(row => ({
    ...row,
    service_id_list: row.service_ids
      ? String(row.service_ids).split(',').map(id => Number(id))
      : [],
  }));
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

async function updateStaff(staffId, merchantId, fullName, role, bio, experienceYears, serviceIds = []) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      `UPDATE staff
       SET full_name = ?,
           role = ?,
           bio = ?,
           experience_years = ?
       WHERE staff_id = ?
       AND merchant_id = ?`,
      [fullName, role, bio, experienceYears || 0, staffId, merchantId]
    );

    if (!result.affectedRows) {
      await connection.rollback();
      return 0;
    }

    const safeServiceIds = Array.isArray(serviceIds)
      ? serviceIds
      : (serviceIds ? [serviceIds] : []);

    await connection.query(
      `DELETE ss
       FROM staff_service ss
       JOIN service svc ON svc.service_id = ss.service_id
       WHERE ss.staff_id = ?
         AND svc.merchant_id = ?`,
      [staffId, merchantId]
    );

    for (const serviceId of safeServiceIds) {
      await connection.query(
        `INSERT IGNORE INTO staff_service (staff_id, service_id)
         SELECT ?, service_id
         FROM service
         WHERE service_id = ?
           AND merchant_id = ?`,
        [staffId, serviceId, merchantId]
      );
    }

    await connection.commit();
    return result.affectedRows;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
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
    `SELECT DISTINCT s.*
     FROM staff s
     JOIN staff_service ss ON ss.staff_id = s.staff_id
     WHERE ss.service_id = ?
     AND s.merchant_id = ?
     AND s.is_active = 1
     ORDER BY s.full_name ASC`,
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
