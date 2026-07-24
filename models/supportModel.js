const db = require('../config/db');

const SUPPORT_CATEGORIES = [
  'booking',
  'payment',
  'refund',
  'voucher_promotion',
  'whatsapp',
  'account',
  'merchant',
  'technical',
  'other'
];

function buildLine(label, value) {
  const safeValue = value ? String(value).trim() : '-';
  return label + ': ' + safeValue;
}

function normalizeSupportCategory(value) {
  const category = String(value || '').trim().toLowerCase();
  return SUPPORT_CATEGORIES.includes(category) ? category : 'other';
}

async function createWhatsAppSupportRequest({
  customerId = null,
  phone,
  message,
  isDuringSupportHours,
  category = 'other'
}) {
  const supportStatus = isDuringSupportHours ? 'waiting_for_agent' : 'after_hours';
  const supportCategory = normalizeSupportCategory(category);
  const details = [
    'WhatsApp support request',
    'Status: ' + supportStatus,
    'Category: ' + supportCategory,
    'Phone: ' + (phone || '-'),
    'Message: ' + message
  ].join('\n');

  const [result] = await db.query(
    `INSERT INTO validation_log
       (user_id, booking_id, module, error_type, error_message, is_resolved)
     VALUES (?, NULL, 'whatsapp_support', ?, ?, FALSE)`,
    [customerId, supportCategory, details]
  );

  return result.insertId;
}

async function createWebSupportRequest({
  userId = null,
  submittedBy,
  name,
  email,
  phone,
  category,
  message
}) {
  const details = [
    'Web support request',
    buildLine('Submitted by', submittedBy),
    buildLine('Name', name),
    buildLine('Email', email),
    buildLine('Phone', phone),
    buildLine('Category', category),
    'Message:',
    String(message || '').trim()
  ].join('\n');

  const [result] = await db.query(
    `INSERT INTO validation_log
       (user_id, booking_id, module, error_type, error_message, is_resolved)
     VALUES (?, NULL, 'web_support', ?, ?, FALSE)`,
    [userId, category, details]
  );

  return result.insertId;
}

module.exports = {
  SUPPORT_CATEGORIES,
  normalizeSupportCategory,
  createWhatsAppSupportRequest,
  createWebSupportRequest
};
