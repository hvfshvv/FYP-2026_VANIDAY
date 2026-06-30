/*
 * adminValidationModel.js
 * Handles the validation_log table: querying, filtering, resolving, and
 * appending admin replies to support log entries. Used by the validation
 * and WhatsApp support screens in the admin panel.
 */

const db = require('../config/db');

// ── VALIDATION LOG QUERIES ─────────────────────────────────────────────────

// Returns filtered validation logs — supports module, open/resolved status, and keyword search.
async function getValidationLogs({ module = 'all', status = 'all', search = '' } = {}) {
  const filters = [];
  const params = [];

  if (module && module !== 'all') {
    filters.push('vl.module = ?');
    params.push(module);
  }

  if (status === 'open') {
    filters.push('vl.is_resolved = FALSE');
  } else if (status === 'resolved') {
    filters.push('vl.is_resolved = TRUE');
  }

  const safeSearch = String(search || '').trim();
  if (safeSearch) {
    // Search across module, error type, message text, and the linked user's name/email.
    filters.push('(vl.module LIKE ? OR vl.error_type LIKE ? OR vl.error_message LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)');
    const like = '%' + safeSearch + '%';
    params.push(like, like, like, like, like);
  }

  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  const [rows] = await db.query(
    `SELECT
       vl.log_id,
       vl.user_id,
       vl.booking_id,
       vl.module,
       vl.error_type,
       vl.error_message,
       vl.is_resolved,
       vl.created_at,
       u.full_name AS customer_name,
       u.email AS customer_email,
       u.phone AS customer_phone
     FROM validation_log vl
     LEFT JOIN users u ON u.user_id = vl.user_id
     ${where}
     ORDER BY vl.created_at DESC
     LIMIT 200`,
    params
  );

  return rows;
}

// Returns open/resolved counts and open WhatsApp support ticket count.
async function getValidationLogSummary() {
  const [rows] = await db.query(
    `SELECT
       COUNT(*) AS total_logs,
       SUM(CASE WHEN is_resolved = FALSE THEN 1 ELSE 0 END) AS open_logs,
       SUM(CASE WHEN is_resolved = TRUE THEN 1 ELSE 0 END) AS resolved_logs,
       SUM(CASE WHEN module = 'whatsapp_support' AND is_resolved = FALSE THEN 1 ELSE 0 END) AS open_whatsapp_support
     FROM validation_log`
  );

  return rows[0] || {};
}

// ── LOG MUTATIONS ──────────────────────────────────────────────────────────

// Marks a validation log entry as resolved.
async function markValidationLogResolved(logId) {
  const [result] = await db.query(
    'UPDATE validation_log SET is_resolved = TRUE WHERE log_id = ?',
    [logId]
  );

  return result.affectedRows;
}

// Fetches a single validation log record with linked customer details.
async function getValidationLogById(logId) {
  const [rows] = await db.query(
    `SELECT
       vl.*,
       u.full_name AS customer_name,
       u.email AS customer_email,
       u.phone AS customer_phone
     FROM validation_log vl
     LEFT JOIN users u ON u.user_id = vl.user_id
     WHERE vl.log_id = ?
     LIMIT 1`,
    [logId]
  );

  return rows[0] || null;
}

// Appends an admin reply to a WhatsApp support log entry and marks it resolved.
async function appendValidationLogReply(logId, reply, adminName) {
  const replyBlock = [
    '',
    'Admin reply by ' + (adminName || 'Uniday Support') + ':',
    String(reply || '').trim(),
    'Reply sent at: ' + new Date().toISOString()
  ].join('\n');

  const [result] = await db.query(
    `UPDATE validation_log
     SET error_message = CONCAT(error_message, ?),
         is_resolved = TRUE
     WHERE log_id = ?`,
    [replyBlock, logId]
  );

  return result.affectedRows;
}

// ── ADMIN ACTION LOGGING ───────────────────────────────────────────────────

// Writes a structured admin action entry for audit trail purposes.
async function logAdminAction(adminId, actionType, targetTable, targetId, description) {
  try {
    await db.query(
      `INSERT INTO admin_action_log
        (admin_id, action_type, target_table, target_id, description)
       VALUES (?, ?, ?, ?, ?)`,
      [adminId, actionType, targetTable, targetId, description]
    );
  } catch (err) {
    console.error('Failed to write admin action log:', err.message);
  }
}

module.exports = {
  getValidationLogs,
  getValidationLogSummary,
  markValidationLogResolved,
  getValidationLogById,
  appendValidationLogReply,
  logAdminAction,
};
