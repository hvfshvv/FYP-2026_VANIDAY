const db = require('../config/db');

async function getAvailabilityByMerchant(merchantId) {
  const [rows] = await db.query(
    `SELECT *
     FROM merchant_availability
     WHERE merchant_id = ?
     ORDER BY FIELD(day_of_week, 'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')`,
    [merchantId]
  );

  return rows;
}

async function saveAvailability(merchantId, dayOfWeek, startTime, endTime, isActive) {
  const [existing] = await db.query(
    `SELECT availability_id
     FROM merchant_availability
     WHERE merchant_id = ? AND day_of_week = ?`,
    [merchantId, dayOfWeek]
  );

  if (existing.length > 0) {
    await db.query(
      `UPDATE merchant_availability
       SET start_time = ?, end_time = ?, is_active = ?
       WHERE merchant_id = ? AND day_of_week = ?`,
      [startTime, endTime, isActive, merchantId, dayOfWeek]
    );
  } else {
    await db.query(
      `INSERT INTO merchant_availability
        (merchant_id, day_of_week, start_time, end_time, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [merchantId, dayOfWeek, startTime, endTime, isActive]
    );
  }
}

async function deleteAvailability(availabilityId, merchantId) {
  await db.query(
    `DELETE FROM merchant_availability
     WHERE availability_id = ? AND merchant_id = ?`,
    [availabilityId, merchantId]
  );
}

module.exports = {
  getAvailabilityByMerchant,
  saveAvailability,
  deleteAvailability
};