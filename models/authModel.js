const db = require('../config/db');
const crypto = require('crypto');

async function findUserByEmail(email) {
  const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0] || null;
}

async function findCustomerUserByEmail(email) {
  const [rows] = await db.query(
    `SELECT u.*, c.customer_id
     FROM users u
     JOIN customer c ON c.user_id = u.user_id
     WHERE u.email = ?
       AND u.role = 'customer'
     LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function createUser(full_name, email, passwordHash, phone, role) {
  const [result] = await db.query(
    'INSERT INTO users (full_name, email, password_hash, phone, role) VALUES (?,?,?,?,?)',
    [full_name, email, passwordHash, phone, role]
  );
  return result.insertId;
}

async function createCustomerProfile(userId, fullName, email, phone, dateOfBirth = null) {
  await db.query(
    `INSERT INTO customer (customer_id, user_id, full_name, email, phone, date_of_birth)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, userId, fullName, email, phone, dateOfBirth]
  );
}


async function createMerchantProfile(userId, merchantName, email, phone, address, businessUen, category) {
  const [result] = await db.query(
    `INSERT INTO merchant
      (user_id, merchant_name, email, business_uen, contact_no, address, category, verification_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [userId, merchantName, email, businessUen, phone, address, category]
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

async function ensureCustomerProfile(userId, fullName, email, phone) {
  const existing = await getCustomerByUserId(userId);
  if (existing) return existing;

  await createCustomerProfile(userId, fullName, email, phone);

  return {
    customer_id: userId,
    user_id: userId,
    full_name: fullName,
    email,
    phone,
  };
}

async function getMerchantByUserId(userId) {
  const [rows] = await db.query('SELECT * FROM merchant WHERE user_id = ?', [userId]);
  return rows[0] || null;
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function createPasswordResetToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(token);

  await db.query(
    `INSERT INTO password_reset_token (user_id, token_hash, expires_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))`,
    [userId, tokenHash]
  );

  return token;
}

async function getValidPasswordResetToken(token) {
  const tokenHash = hashResetToken(token);
  const [rows] = await db.query(
    `SELECT prt.*, u.email, u.full_name
     FROM password_reset_token prt
     JOIN users u ON u.user_id = prt.user_id
     WHERE prt.token_hash = ?
       AND prt.used_at IS NULL
       AND prt.expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );

  return rows[0] || null;
}

async function resetUserPassword(token, passwordHash) {
  const resetToken = await getValidPasswordResetToken(token);
  if (!resetToken) {
    throw new Error('Reset link is invalid or expired.');
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      'UPDATE users SET password_hash = ? WHERE user_id = ?',
      [passwordHash, resetToken.user_id]
    );

    await connection.query(
      'UPDATE password_reset_token SET used_at = NOW() WHERE reset_id = ?',
      [resetToken.reset_id]
    );

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = {
  findUserByEmail,
  findCustomerUserByEmail,
  createUser,
  createCustomerProfile,
  createMerchantProfile,
  getCustomerByUserId,
  ensureCustomerProfile,
  getMerchantByUserId,
  createPasswordResetToken,
  getValidPasswordResetToken,
  resetUserPassword,
};
