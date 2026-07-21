const db = require('../config/db');
const crypto = require('crypto');

async function findUserByEmail(email) {
  const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0] || null;
}

async function getUserById(userId) {
  const [rows] = await db.query(
    'SELECT * FROM users WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return rows[0] || null;
}

async function findCustomerUserByEmail(email) {
  const [rows] = await db.query(
    `SELECT u.*, u.user_id AS customer_id
     FROM users u
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
  await setUserDateOfBirthIfSupported(userId, dateOfBirth);

  if (!(await tableExists('customer'))) return;

  await db.query(
    `INSERT INTO customer (customer_id, user_id, full_name, email, phone, date_of_birth)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, userId, fullName, email, phone, dateOfBirth]
  );
}

async function ensureMerchantTermsSchema() {
  const addColumnIfMissing = async (columnName, ddl) => {
    if (await columnExists('merchant', columnName)) return;
    try {
      await db.query(ddl);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }
  };

  await addColumnIfMissing(
    'terms_accepted_at',
    'ALTER TABLE merchant ADD COLUMN terms_accepted_at DATETIME NULL AFTER verification_status'
  );
  await addColumnIfMissing(
    'terms_version',
    'ALTER TABLE merchant ADD COLUMN terms_version VARCHAR(32) NULL AFTER terms_accepted_at'
  );
}

async function createMerchantProfile(userId, merchantName, email, phone, address, businessUen, category) {
  await ensureMerchantTermsSchema();
  const [result] = await db.query(
    `INSERT INTO merchant
      (user_id, merchant_name, email, business_uen, contact_no, address, category, verification_status, terms_accepted_at, terms_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), ?)`,
    [userId, merchantName, email, businessUen, phone, address, category, '2026-07']
  );

  return result.insertId;
}

async function createMerchantAccount({
  fullName,
  loginEmail,
  passwordHash,
  ownerPhone,
  merchantName,
  businessEmail,
  businessPhone,
  address,
  businessUen,
  category,
  termsVersion = '2026-07',
}) {
  await ensureMerchantTermsSchema();
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [userResult] = await connection.query(
      'INSERT INTO users (full_name, email, password_hash, phone, role) VALUES (?,?,?,?,?)',
      [fullName, loginEmail, passwordHash, ownerPhone, 'merchant']
    );

    const userId = userResult.insertId;
    const [merchantResult] = await connection.query(
      `INSERT INTO merchant
        (user_id, merchant_name, email, business_uen, contact_no, address, category, verification_status, terms_accepted_at, terms_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), ?)`,
      [userId, merchantName, businessEmail, businessUen, businessPhone, address, category, termsVersion]
    );

    await connection.commit();
    return { userId, merchantId: merchantResult.insertId };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function getCustomerByUserId(userId) {
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

async function ensureCustomerProfile(userId, fullName, email, phone) {
  const existingUser = await getCustomerByUserId(userId);
  if (existingUser) {
    await ensureLegacyCustomerRow(existingUser, fullName, email, phone);
    return existingUser;
  }

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
  await ensureMerchantTermsSchema();
  const [rows] = await db.query('SELECT * FROM merchant WHERE user_id = ?', [userId]);
  return rows[0] || null;
}

async function acceptMerchantTerms(userId, termsVersion = '2026-07') {
  await ensureMerchantTermsSchema();
  const [result] = await db.query(
    `UPDATE merchant
     SET terms_accepted_at = NOW(),
         terms_version = ?
     WHERE user_id = ?`,
    [termsVersion, userId]
  );
  return result.affectedRows;
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

async function columnExists(tableName, columnName) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );

  return Number(row?.count || 0) > 0;
}

async function setUserDateOfBirthIfSupported(userId, dateOfBirth) {
  if (!dateOfBirth) return;
  if (!(await columnExists('users', 'date_of_birth'))) return;

  await db.query(
    'UPDATE users SET date_of_birth = ? WHERE user_id = ?',
    [dateOfBirth, userId]
  );
}

async function updateUserProfile(userId, { fullName, phone, dateOfBirth }) {
  const fields = ['full_name = ?', 'phone = ?'];
  const params = [fullName, phone || null];

  if (await columnExists('users', 'date_of_birth')) {
    fields.push('date_of_birth = ?');
    params.push(dateOfBirth || null);
  }

  params.push(userId);

  await db.query(
    `UPDATE users SET ${fields.join(', ')} WHERE user_id = ?`,
    params
  );

  const user = await getUserById(userId);
  if (user && user.role === 'customer') {
    await ensureLegacyCustomerRow(user, user.full_name, user.email, user.phone);
  }

  return user;
}

async function updateUserPassword(userId, passwordHash) {
  const [result] = await db.query(
    'UPDATE users SET password_hash = ? WHERE user_id = ?',
    [passwordHash, userId]
  );
  return result.affectedRows;
}

async function ensureLegacyCustomerRow(user, fullName = null, email = null, phone = null) {
  if (!(await tableExists('customer'))) return;

  await db.query(
    `INSERT INTO customer (customer_id, user_id, full_name, email, phone)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       full_name = VALUES(full_name),
       email = VALUES(email),
       phone = VALUES(phone)`,
    [
      user.user_id,
      user.user_id,
      fullName || user.full_name,
      email || user.email,
      phone || user.phone || null,
    ]
  );
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function createEmailVerificationToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);

  await db.query(
    `INSERT INTO email_verification_token (user_id, token_hash, expires_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
    [userId, tokenHash]
  );

  return token;
}

async function verifyEmailToken(token) {
  const tokenHash = hashToken(token);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [[verificationToken]] = await connection.query(
      `SELECT evt.*, u.email, u.full_name
       FROM email_verification_token evt
       JOIN users u ON u.user_id = evt.user_id
       WHERE evt.token_hash = ?
         AND evt.used_at IS NULL
         AND evt.expires_at > NOW()
       LIMIT 1
       FOR UPDATE`,
      [tokenHash]
    );

    if (!verificationToken) {
      await connection.rollback();
      return null;
    }

    await connection.query(
      'UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE user_id = ?',
      [verificationToken.user_id]
    );

    await connection.query(
      'UPDATE email_verification_token SET used_at = NOW() WHERE verification_id = ?',
      [verificationToken.verification_id]
    );

    await connection.commit();
    return verificationToken;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function createPasswordResetToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);

  await db.query(
    `INSERT INTO password_reset_token (user_id, token_hash, expires_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))`,
    [userId, tokenHash]
  );

  return token;
}

async function getValidPasswordResetToken(token) {
  const tokenHash = hashToken(token);
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
  getUserById,
  createUser,
  createCustomerProfile,
  createMerchantProfile,
  createMerchantAccount,
  getCustomerByUserId,
  ensureCustomerProfile,
  updateUserProfile,
  updateUserPassword,
  getMerchantByUserId,
  acceptMerchantTerms,
  createEmailVerificationToken,
  verifyEmailToken,
  createPasswordResetToken,
  getValidPasswordResetToken,
  resetUserPassword,
};
