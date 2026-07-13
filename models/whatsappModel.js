const bcrypt = require('bcryptjs');
const db = require('../config/db');

function cleanPhone(phone) {
  return String(phone || '')
    .replace('whatsapp:', '')
    .trim();
}

function phoneDigits(phone) {
  return cleanPhone(phone).replace(/\D/g, '');
}

async function findCustomerUserByPhone(phone) {
  const clean = cleanPhone(phone);
  const digits = phoneDigits(phone);
  const localDigits = digits.slice(-8);

  const [rows] = await db.query(
    `SELECT *
     FROM users
     WHERE role = 'customer'
       AND status = 'active'
       AND (
         phone = ?
         OR phone = ?
         OR REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', '') = ?
         OR REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', '') = ?
       )
     LIMIT 1`,
    [clean, digits, digits, localDigits]
  );

  return rows[0] || null;
}

async function findCustomerProfileByUserId(userId) {
  const [rows] = await db.query(
    `SELECT u.*, u.user_id AS customer_id
     FROM users u
     WHERE u.user_id = ?
       AND u.role = 'customer'
     LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
}

async function tableExists(tableName) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [tableName]
  );

  return Number(row?.count || 0) > 0;
}

async function ensureLegacyCustomerRow(user) {
  if (!(await tableExists('customer'))) return;

  await db.query(
    `INSERT INTO customer (customer_id, user_id, full_name, email, phone)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       full_name = VALUES(full_name),
       email = VALUES(email),
       phone = VALUES(phone)`,
    [user.user_id, user.user_id, user.full_name, user.email, user.phone]
  );
}

async function ensureCustomerProfile(user) {
  const existingProfile = await findCustomerProfileByUserId(user.user_id);

  if (existingProfile) {
    await ensureLegacyCustomerRow(existingProfile);
    return existingProfile;
  }

  await ensureLegacyCustomerRow(user);

  return {
    customer_id: user.user_id,
    user_id: user.user_id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone
  };
}

async function findOrCreateCustomerByPhone(phone) {
  const existingUser = await findCustomerUserByPhone(phone);

  if (existingUser) {
    return ensureCustomerProfile(existingUser);
  }

  const clean = cleanPhone(phone);
  const digits = phoneDigits(phone);
  const email = 'whatsapp_' + digits + '@uniday.local';
  const passwordHash = await bcrypt.hash('whatsapp-' + Date.now() + '-' + digits, 10);

  const [result] = await db.query(
    `INSERT INTO users (full_name, email, password_hash, phone, role)
     VALUES (?, ?, ?, ?, 'customer')`,
    ['WhatsApp Customer ' + digits, email, passwordHash, clean]
  );

  const newUser = {
    user_id: result.insertId,
    full_name: 'WhatsApp Customer ' + digits,
    email: email,
    phone: clean,
    role: 'customer'
  };

  return ensureCustomerProfile(newUser);
}

async function findExistingCustomerByPhone(phone) {
  const existingUser = await findCustomerUserByPhone(phone);

  if (!existingUser) {
    return null;
  }

  return ensureCustomerProfile(existingUser);
}

module.exports = {
  findExistingCustomerByPhone,
  findOrCreateCustomerByPhone
};
