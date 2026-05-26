const db = require('../config/db');

async function createWhatsAppSupportRequest({
  customerId = null,
  phone,
  message,
  isDuringSupportHours
}) {
  const supportStatus = isDuringSupportHours ? 'waiting_for_agent' : 'after_hours';
  const details = [
    'WhatsApp support request',
    'Status: ' + supportStatus,
    'Phone: ' + (phone || '-'),
    'Message: ' + message
  ].join('\n');

  const [result] = await db.query(
    `INSERT INTO validation_log
       (user_id, booking_id, module, error_type, error_message, is_resolved)
     VALUES (?, NULL, 'whatsapp_support', ?, ?, FALSE)`,
    [customerId, supportStatus, details]
  );

  return result.insertId;
}

module.exports = {
  createWhatsAppSupportRequest
};
