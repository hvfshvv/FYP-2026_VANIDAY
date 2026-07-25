const bcrypt = require('bcryptjs');
const db = require('../config/db');

const SESSION_STATUSES = ['active', 'completed', 'abandoned', 'inactive', 'expired'];
const MESSAGE_TYPES = ['enquiry', 'booking', 'confirmation', 'reminder', 'cancellation', 'reschedule'];
let columnCache = {};

function cleanPhone(phone) {
  const raw = String(phone || '')
    .replace('whatsapp:', '')
    .trim();
  const digits = raw.replace(/\D/g, '');

  if (digits.length === 8) {
    return '+65' + digits;
  }
  if (raw.startsWith('+') && digits) {
    return '+' + digits;
  }
  return raw;
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

async function getTableColumns(tableName) {
  if (columnCache[tableName]) {
    return columnCache[tableName];
  }

  const [rows] = await db.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [tableName]
  );

  columnCache[tableName] = rows.reduce(function (columns, row) {
    columns[row.COLUMN_NAME] = true;
    return columns;
  }, {});

  return columnCache[tableName];
}

function parseTempData(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    console.error('[whatsapp] Failed to parse session temp_data:', error.message);
    return null;
  }
}

function normalizeSession(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    temp_data: parseTempData(row.temp_data)
  };
}

function sessionIdsFromData(sessionData) {
  const data = sessionData || {};

  return {
    customerId: data.customer ? data.customer.customer_id || data.customer.user_id : null,
    merchantId: data.merchant ? data.merchant.merchant_id : null
  };
}

function safeMessageType(messageType) {
  return MESSAGE_TYPES.includes(messageType) ? messageType : 'enquiry';
}

function safeStatus(status) {
  return SESSION_STATUSES.includes(status) ? status : 'abandoned';
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

async function findActiveSessionByPhone(phone) {
  if (!(await tableExists('whatsapp_session'))) return null;

  const clean = cleanPhone(phone);
  const digits = phoneDigits(phone);
  const localDigits = digits.slice(-8);
  const [rows] = await db.query(
    `SELECT *
     FROM whatsapp_session
     WHERE (
         phone = ?
         OR REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', '') = ?
         OR REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', '') = ?
       )
       AND status = 'active'
     ORDER BY updated_at DESC, session_id DESC
     LIMIT 1`,
    [clean, digits, localDigits]
  );

  return normalizeSession(rows[0] || null);
}

async function createSession({
  phone,
  sessionState = null,
  customerId = null,
  merchantId = null,
  tempData = null,
  status = 'active'
}) {
  if (!(await tableExists('whatsapp_session'))) return null;

  const columns = await getTableColumns('whatsapp_session');
  const clean = cleanPhone(phone);
  const insertColumns = ['phone', 'customer_id', 'merchant_id', 'session_state', 'status'];
  const placeholders = ['?', '?', '?', '?', '?'];
  const values = [clean, customerId, merchantId, sessionState, safeStatus(status)];

  if (columns.temp_data) {
    insertColumns.push('temp_data');
    placeholders.push('?');
    values.push(tempData ? JSON.stringify(tempData) : null);
  }

  const [result] = await db.query(
    `INSERT INTO whatsapp_session (${insertColumns.join(', ')})
     VALUES (${placeholders.join(', ')})`,
    values
  );

  return {
    session_id: result.insertId,
    phone: clean,
    customer_id: customerId,
    merchant_id: merchantId,
    session_state: sessionState,
    temp_data: tempData,
    status: safeStatus(status)
  };
}

async function deactivateDuplicateActiveSessions(phone, keepSessionId) {
  if (!(await tableExists('whatsapp_session')) || !keepSessionId) return;

  const clean = cleanPhone(phone);
  const digits = phoneDigits(phone);
  const localDigits = digits.slice(-8);
  await db.query(
    `UPDATE whatsapp_session
     SET status = 'abandoned',
         updated_at = CURRENT_TIMESTAMP
     WHERE (
         phone = ?
         OR REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', '') = ?
         OR REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', '') = ?
       )
       AND status = 'active'
       AND session_id <> ?`,
    [clean, digits, localDigits, keepSessionId]
  );
}

async function getOrCreateActiveSession(phone) {
  const existing = await findActiveSessionByPhone(phone);

  if (existing) {
    await deactivateDuplicateActiveSessions(phone, existing.session_id);
    return existing;
  }

  return createSession({ phone: phone });
}

async function updateSessionState(sessionId, sessionState, tempData = null) {
  if (!(await tableExists('whatsapp_session')) || !sessionId) return;

  const columns = await getTableColumns('whatsapp_session');

  if (columns.temp_data) {
    await db.query(
      `UPDATE whatsapp_session
       SET session_state = ?,
           temp_data = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE session_id = ?`,
      [sessionState, tempData ? JSON.stringify(tempData) : null, sessionId]
    );
    return;
  }

  await db.query(
    `UPDATE whatsapp_session
     SET session_state = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE session_id = ?`,
    [sessionState, sessionId]
  );
}

async function updateSessionParties(sessionId, { customerId = null, merchantId = null }) {
  if (!(await tableExists('whatsapp_session')) || !sessionId) return;

  await db.query(
    `UPDATE whatsapp_session
     SET customer_id = COALESCE(?, customer_id),
         merchant_id = COALESCE(?, merchant_id),
         updated_at = CURRENT_TIMESTAMP
     WHERE session_id = ?`,
    [customerId, merchantId, sessionId]
  );
}

async function updateActiveSessionStateByPhone(phone, sessionData) {
  const session = await getOrCreateActiveSession(phone);
  if (!session) return null;

  const ids = sessionIdsFromData(sessionData);
  const sessionState = sessionData ? sessionData.state || null : null;

  await updateSessionState(session.session_id, sessionState, sessionData || null);
  await updateSessionParties(session.session_id, ids);

  return findActiveSessionByPhone(phone);
}

async function markSessionStatus(sessionId, status = 'completed') {
  if (!(await tableExists('whatsapp_session')) || !sessionId) return;

  await db.query(
    `UPDATE whatsapp_session
     SET status = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE session_id = ?`,
    [safeStatus(status), sessionId]
  );
}

async function markActiveSessionStatusByPhone(phone, status = 'completed') {
  const session = await findActiveSessionByPhone(phone);
  if (!session) return null;

  await markSessionStatus(session.session_id, status);
  return session.session_id;
}

async function insertMessage({
  sessionId,
  bookingId = null,
  direction,
  messageType = 'enquiry',
  messageContent,
  status
}) {
  if (!(await tableExists('whatsapp_message')) || !sessionId || !messageContent) return null;

  const [result] = await db.query(
    `INSERT INTO whatsapp_message
       (session_id, booking_id, direction, message_type, message_content, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      bookingId,
      direction === 'outbound' ? 'outbound' : 'inbound',
      safeMessageType(messageType),
      messageContent,
      status || (direction === 'outbound' ? 'sent' : 'received')
    ]
  );

  return result.insertId;
}

async function linkLatestInboundMessageToBooking(sessionId, bookingId) {
  if (!(await tableExists('whatsapp_message')) || !sessionId || !bookingId) return;

  await db.query(
    `UPDATE whatsapp_message
     SET booking_id = ?
     WHERE session_id = ?
       AND direction = 'inbound'
     ORDER BY created_at DESC, message_id DESC
     LIMIT 1`,
    [bookingId, sessionId]
  );
}

module.exports = {
  findExistingCustomerByPhone,
  findOrCreateCustomerByPhone,
  findActiveSessionByPhone,
  createSession,
  getOrCreateActiveSession,
  updateSessionState,
  updateSessionParties,
  updateActiveSessionStateByPhone,
  markSessionStatus,
  markActiveSessionStatusByPhone,
  insertMessage,
  linkLatestInboundMessageToBooking,
  cleanPhone
};
