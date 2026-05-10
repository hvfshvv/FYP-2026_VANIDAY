const db = require('../config/db');

async function getServicesByMerchant(merchantId) {
  const [rows] = await db.query(
    'SELECT * FROM SERVICE WHERE merchant_id = ? ORDER BY is_active DESC, service_name ASC',
    [merchantId]
  );
  return rows;
}

async function addService(merchantId, { service_name, description, price, duration_mins }) {
  const [result] = await db.query(
    'INSERT INTO SERVICE (merchant_id, service_name, description, price, duration_mins) VALUES (?,?,?,?,?)',
    [merchantId, service_name, description || null, parseFloat(price), parseInt(duration_mins)]
  );
  return result.insertId;
}

async function toggleService(serviceId, merchantId) {
  await db.query(
    'UPDATE SERVICE SET is_active = NOT is_active WHERE service_id = ? AND merchant_id = ?',
    [serviceId, merchantId]
  );
}

async function deleteService(serviceId, merchantId) {
  await db.query(
    'DELETE FROM SERVICE WHERE service_id = ? AND merchant_id = ?',
    [serviceId, merchantId]
  );
}

module.exports = { getServicesByMerchant, addService, toggleService, deleteService };
