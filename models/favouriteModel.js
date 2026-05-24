const db = require('../config/db');
const { withResolvedMerchantImage } = require('../utils/merchantImages');

// INSERT IGNORE prevents duplicate favourite rows if the user clicks twice.
async function addMerchantFavourite(customerId, merchantId) {
  await db.query(
    `INSERT IGNORE INTO favourite (customer_id, merchant_id, service_id)
     VALUES (?, ?, NULL)`,
    [customerId, merchantId]
  );
}

// Merchant favourites have service_id = NULL, so this only removes the merchant save.
async function removeMerchantFavourite(customerId, merchantId) {
  await db.query(
    `DELETE FROM favourite
     WHERE customer_id = ?
     AND merchant_id = ?
     AND service_id IS NULL`,
    [customerId, merchantId]
  );
}

// Checks if a merchant heart button should appear filled for this customer.
async function isMerchantFavourite(customerId, merchantId) {
  const [rows] = await db.query(
    `SELECT *
     FROM favourite
     WHERE customer_id = ?
     AND merchant_id = ?
     AND service_id IS NULL`,
    [customerId, merchantId]
  );

  return rows.length > 0;
}

// Gets all merchants saved by the customer.
async function getFavouriteMerchants(customerId) {
  const [rows] = await db.query(
    `SELECT m.*
     FROM favourite f
     JOIN merchant m
       ON f.merchant_id = m.merchant_id
     WHERE f.customer_id = ?
     AND f.service_id IS NULL`,
    [customerId]
  );

  return rows.map(withResolvedMerchantImage);
}

// Service favourites store both merchant_id and service_id.
async function addServiceFavourite(customerId, merchantId, serviceId) {
  await db.query(
    `INSERT IGNORE INTO favourite (customer_id, merchant_id, service_id)
     VALUES (?, ?, ?)`,
    [customerId, merchantId, serviceId]
  );
}

// Removes a saved service for this customer only.
async function removeServiceFavourite(customerId, serviceId) {
  await db.query(
    `DELETE FROM favourite
     WHERE customer_id = ?
     AND service_id = ?`,
    [customerId, serviceId]
  );
}

// Gets saved services, optionally filtered by the service category.
async function getFavouriteServices(customerId, category = null) {
  const params = [customerId];

  let categoryFilter = '';

  if (category) {
    categoryFilter = ' AND LOWER(s.category) = LOWER(?)';
    params.push(category);
  }

  const [rows] = await db.query(
    `SELECT 
       f.favourite_id,
       f.customer_id,
       f.merchant_id,
       f.service_id,
       s.service_name,
       s.description,
       s.category,
       s.price,
       s.duration_mins,
       m.merchant_name,
       m.category AS merchant_category,
       m.address
     FROM favourite f
     JOIN service s ON f.service_id = s.service_id
     JOIN merchant m ON f.merchant_id = m.merchant_id
     WHERE f.customer_id = ?
     AND f.service_id IS NOT NULL
     ${categoryFilter}
     ORDER BY s.category, s.service_name`,
    params
  );

  return rows;
}

// Used on the merchant details page to decide which service hearts are filled.
async function getFavouriteServiceIds(customerId, merchantId) {
  const [rows] = await db.query(
    `SELECT service_id
     FROM favourite
     WHERE customer_id = ?
     AND merchant_id = ?
     AND service_id IS NOT NULL`,
    [customerId, merchantId]
  );

  return rows.map(row => row.service_id);
}

module.exports = {
  addMerchantFavourite,
  removeMerchantFavourite,
  isMerchantFavourite,
  getFavouriteMerchants,
  addServiceFavourite,
  removeServiceFavourite,
  getFavouriteServices,
  getFavouriteServiceIds
};
