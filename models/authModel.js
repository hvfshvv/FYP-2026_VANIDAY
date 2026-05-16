const db = require('../config/db');

async function findUserByEmail(email) {
  const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0] || null;
}

async function createUser(full_name, email, passwordHash, phone, role) {
  const [result] = await db.query(
    'INSERT INTO users (full_name, email, password_hash, phone, role) VALUES (?,?,?,?,?)',
    [full_name, email, passwordHash, phone, role]
  );
  return result.insertId;
}

async function createCustomerProfile(userId, fullName, email, phone) {
  await db.query(
    `INSERT INTO customer (customer_id, user_id, full_name, email, phone)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, userId, fullName, email, phone]
  );
}


async function createMerchantProfile(userId, merchantName, email, phone, address, businessUen) {
  const [result] = await db.query(
    `INSERT INTO merchant
      (user_id, merchant_name, email, business_uen, contact_no, address, verification_status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [userId, merchantName, email, businessUen, phone, address]
  );

  return result.insertId;
}

async function getCustomerByUserId(userId) {
  const [rows] = await db.query(
    'SELECT * FROM customer WHERE user_id = ?',
    [userId]
  );
  return rows[0] || null;
}

async function getMerchantByUserId(userId) {
  const [rows] = await db.query('SELECT * FROM merchant WHERE user_id = ?', [userId]);
  return rows[0] || null;
}

module.exports = { findUserByEmail, createUser, createCustomerProfile,createMerchantProfile,getCustomerByUserId, getMerchantByUserId };
