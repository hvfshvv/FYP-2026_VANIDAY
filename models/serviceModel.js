const db = require('../config/db');

// Active services are listed first, then sorted by name.
async function getServicesByMerchant(merchantId) {
  const [rows] = await db.query(
    'SELECT * FROM service WHERE merchant_id = ? ORDER BY is_active DESC, service_name ASC',
    [merchantId]
  );
  return rows;
}

// Inserts one service that customers can book.
async function addService(merchantId, { service_name, description, price, duration_mins }) {
  const [result] = await db.query(
    'INSERT INTO service (merchant_id, service_name, description, price, duration_mins) VALUES (?,?,?,?,?)',
    [merchantId, service_name, description || null, parseFloat(price), parseInt(duration_mins)]
  );
  return result.insertId;
}

// Toggles visibility without deleting the service record.
async function toggleService(serviceId, merchantId) {
  await db.query(
    'UPDATE service SET is_active = NOT is_active WHERE service_id = ? AND merchant_id = ?',
    [serviceId, merchantId]
  );
}

// Merchant id check prevents one merchant from deleting another merchant's service.
async function deleteService(serviceId, merchantId) {
  await db.query(
    'DELETE FROM service WHERE service_id = ? AND merchant_id = ?',
    [serviceId, merchantId]
  );
}

module.exports = { getServicesByMerchant, addService, toggleService, deleteService };
