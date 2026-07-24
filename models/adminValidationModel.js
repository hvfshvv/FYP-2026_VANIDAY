/*
 * adminValidationModel.js
 * Handles the validation_log table: querying, filtering, resolving, and
 * appending admin replies to support log entries. Used by the validation
 * and WhatsApp support screens in the admin panel.
 */

const db = require('../config/db');

const TECHNICAL_LOG_MODULES = ['booking', 'payment', 'whatsapp'];
const MAX_ERROR_MESSAGE_LENGTH = 1000;
const DEFAULT_LOGS_PER_PAGE = 25;

function normalizeNullableId(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeErrorType(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_')
    .slice(0, 100);
}

function sanitizeErrorMessage(value) {
  return String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

// ── VALIDATION LOG QUERIES ─────────────────────────────────────────────────

// Returns filtered validation logs — supports module, open/resolved status, and keyword search.
function buildValidationLogFilters({ module = 'all', status = 'all', search = '' } = {}) {
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

  return { where, params };
}

function normalizePositiveInteger(value, fallback) {
  const raw = String(value || '').trim();
  if (!/^[1-9]\d*$/.test(raw)) return fallback;

  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

// Returns filtered validation logs with pagination.
async function getValidationLogs({ module = 'all', status = 'all', search = '', page = 1, perPage = DEFAULT_LOGS_PER_PAGE } = {}) {
  const pageSize = normalizePositiveInteger(perPage, DEFAULT_LOGS_PER_PAGE);
  const requestedPage = normalizePositiveInteger(page, 1);
  const { where, params } = buildValidationLogFilters({ module, status, search });

  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM validation_log vl
     LEFT JOIN users u ON u.user_id = vl.user_id
     ${where}`,
    params
  );

  const totalLogs = Number(countRows[0] && countRows[0].total) || 0;
  const totalPages = Math.max(Math.ceil(totalLogs / pageSize), 1);
  const currentPage = Math.min(requestedPage, totalPages);
  const offset = (currentPage - 1) * pageSize;

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
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return {
    logs: rows,
    pagination: {
      currentPage,
      perPage: pageSize,
      totalLogs,
      totalPages,
      startItem: totalLogs ? offset + 1 : 0,
      endItem: Math.min(offset + rows.length, totalLogs),
      hasPrevious: currentPage > 1,
      hasNext: currentPage < totalPages
    }
  };
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

function shouldResolveFromOptions(options) {
  return !options || options.resolve !== false;
}

// Appends an admin reply to a WhatsApp support log entry and optionally marks it resolved.
async function appendValidationLogReply(logId, reply, adminName, options = {}) {
  const shouldResolve = shouldResolveFromOptions(options);
  const replyBlock = [
    '',
    'Admin reply by ' + (adminName || 'Uniday Support') + ':',
    'Status: ' + (shouldResolve ? 'resolved' : 'kept open'),
    String(reply || '').trim(),
    'Reply sent at: ' + new Date().toISOString()
  ].join('\n');

  const [result] = await db.query(
    `UPDATE validation_log
     SET error_message = CONCAT(error_message, ?),
         is_resolved = CASE WHEN ? THEN TRUE ELSE is_resolved END
     WHERE log_id = ?
       AND module = 'whatsapp_support'
       AND is_resolved = FALSE`,
    [replyBlock, shouldResolve, logId]
  );

  return result.affectedRows;
}

// Appends a delivered email reply to a web support log entry and optionally marks it resolved.
async function appendWebSupportEmailReply(logId, reply, adminName, options = {}) {
  const shouldResolve = shouldResolveFromOptions(options);
  const replyBlock = [
    '',
    'Admin reply by ' + (adminName || 'Uniday Support') + ':',
    'Channel: email',
    'Status: ' + (shouldResolve ? 'resolved' : 'kept open'),
    String(reply || '').trim(),
    'Reply sent at: ' + new Date().toISOString()
  ].join('\n');

  const [result] = await db.query(
    `UPDATE validation_log
     SET error_message = CONCAT(error_message, ?),
         is_resolved = CASE WHEN ? THEN TRUE ELSE is_resolved END
     WHERE log_id = ?
       AND module = 'web_support'
       AND is_resolved = FALSE`,
    [replyBlock, shouldResolve, logId]
  );

  return result.affectedRows;
}

// Best-effort technical error logging for the admin validation page.
async function logTechnicalValidationError({
  userId = null,
  bookingId = null,
  module,
  errorType,
  errorMessage
} = {}) {
  const safeModule = String(module || '').trim();
  const safeErrorType = normalizeErrorType(errorType);
  const safeErrorMessage = sanitizeErrorMessage(errorMessage);
  const safeUserId = normalizeNullableId(userId);
  const safeBookingId = normalizeNullableId(bookingId);

  if (!TECHNICAL_LOG_MODULES.includes(safeModule) || !safeErrorType || !safeErrorMessage) {
    return null;
  }

  try {
    const [existing] = await db.query(
      `SELECT log_id
       FROM validation_log
       WHERE module = ?
         AND error_type = ?
         AND COALESCE(user_id, 0) = COALESCE(?, 0)
         AND COALESCE(booking_id, 0) = COALESCE(?, 0)
         AND is_resolved = FALSE
         AND created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 10 MINUTE)
       ORDER BY created_at DESC
       LIMIT 1`,
      [safeModule, safeErrorType, safeUserId, safeBookingId]
    );

    if (existing.length) {
      return existing[0].log_id;
    }

    const [result] = await db.query(
      `INSERT INTO validation_log
         (user_id, booking_id, module, error_type, error_message, is_resolved)
       VALUES (?, ?, ?, ?, ?, FALSE)`,
      [safeUserId, safeBookingId, safeModule, safeErrorType, safeErrorMessage]
    );

    return result.insertId;
  } catch (err) {
    console.error('[validation-log] technical error log failed:', err.message);
    return null;
  }
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
  appendWebSupportEmailReply,
  logTechnicalValidationError,
  logAdminAction,
};
