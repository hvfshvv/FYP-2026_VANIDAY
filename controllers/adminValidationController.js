/*
 * adminValidationController.js
 * Handles admin validation log pages: listing/filtering logs, resolving open
 * tickets, and replying to WhatsApp support conversations via the admin panel.
 */

const adminValidationModel = require('../models/adminValidationModel');
const whatsappNotificationService = require('../services/whatsappNotificationService');
const emailService = require('../services/emailService');

// ── PRIVATE HELPERS ────────────────────────────────────────────────────────

// Extracts the customer phone number from a validation log entry (used for WhatsApp replies).
function extractSupportPhone(log) {
  if (log.customer_phone) {
    return log.customer_phone;
  }

  // Fall back to parsing the phone from the raw error_message field.
  const match = String(log.error_message || '').match(/^Phone:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

function extractWebSupportEmail(log) {
  const match = String(log.error_message || '').match(/^Email:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

function normalizeRecipientEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!email || email.length > 254) return null;
  if (/[\r\n]/.test(email)) return null;
  if (!emailPattern.test(email)) return null;

  return email;
}

function getWebSupportRecipientEmail(log) {
  const requestEmail = normalizeRecipientEmail(extractWebSupportEmail(log));
  if (requestEmail) return requestEmail;

  if (log.user_id) {
    return normalizeRecipientEmail(log.customer_email);
  }

  return null;
}

function isDeliveredEmailResult(result) {
  return Boolean(result && result.sent === true && result.provider !== 'noop' && !result.skipped);
}

// ── VALIDATION LOG PAGES ───────────────────────────────────────────────────

// Renders the validation log listing with module, status, and keyword filters applied.
async function showValidationLogs(req, res) {
  const filters = {
    module: req.query.module || 'all',
    status: req.query.status || 'all',
    search: req.query.search || '',
  };

  try {
    const [logs, summary] = await Promise.all([
      adminValidationModel.getValidationLogs(filters),
      adminValidationModel.getValidationLogSummary(),
    ]);

    res.render('admin/validationLogs', {
      title: 'Validation & Support Logs',
      logs,
      summary,
      filters,
      query: req.query,
    });
  } catch (err) {
    console.error(err);
    res.render('admin/validationLogs', {
      title: 'Validation & Support Logs',
      logs: [],
      summary: {},
      filters,
      query: req.query,
      error: 'Failed to load validation logs.',
    });
  }
}

// Marks a validation log entry as resolved and redirects back to the log list.
async function resolveValidationLog(req, res) {
  try {
    await adminValidationModel.markValidationLogResolved(req.params.logId);
    res.redirect('/admin/validation?resolved=1');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/validation?error=resolve');
  }
}

// Sends a WhatsApp support reply and appends it to the validation log entry.
async function replyToWhatsAppSupport(req, res) {
  const reply = String(req.body.reply || '').trim();

  try {
    if (!reply) {
      return res.redirect('/admin/validation?error=reply');
    }

    const log = await adminValidationModel.getValidationLogById(req.params.logId);

    if (!log || log.module !== 'whatsapp_support') {
      return res.redirect('/admin/validation?error=notfound');
    }

    const phone = extractSupportPhone(log);
    await whatsappNotificationService.sendSupportReply(phone, reply);
    await adminValidationModel.appendValidationLogReply(
      req.params.logId,
      reply,
      req.session.user && req.session.user.full_name
    );

    res.redirect('/admin/validation?replySent=1');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/validation?error=replySend');
  }
}

// Sends an email reply for an open web support log, then marks it resolved.
async function replyToWebSupport(req, res) {
  const reply = String(req.body.reply || '').trim();

  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.redirect('/admin/validation?error=webReplyAuth');
    }

    if (reply.length < 2 || reply.length > 2000) {
      return res.redirect('/admin/validation?error=webReplyValidation');
    }

    const log = await adminValidationModel.getValidationLogById(req.params.logId);

    if (!log || log.module !== 'web_support') {
      return res.redirect('/admin/validation?error=webReplyNotFound');
    }

    if (log.is_resolved) {
      return res.redirect('/admin/validation?error=webReplyResolved');
    }

    const recipientEmail = getWebSupportRecipientEmail(log);
    if (!recipientEmail) {
      return res.redirect('/admin/validation?error=webReplyEmail');
    }

    const emailResult = await emailService.sendWebSupportReplyEmail({
      ...log,
      recipient_email: recipientEmail,
      reply
    });

    if (!isDeliveredEmailResult(emailResult)) {
      console.error('[admin-validation] Web support email was not delivered:', {
        logId: log.log_id,
        provider: emailResult && emailResult.provider,
        reason: emailResult && emailResult.reason,
        skipped: emailResult && emailResult.skipped,
        sent: emailResult && emailResult.sent
      });
      return res.redirect('/admin/validation?error=webReplySend');
    }

    const affectedRows = await adminValidationModel.appendWebSupportEmailReply(
      req.params.logId,
      reply,
      req.session.user && req.session.user.full_name
    );

    if (!affectedRows) {
      return res.redirect('/admin/validation?error=webReplyResolved');
    }

    res.redirect('/admin/validation?webReplySent=1');
  } catch (err) {
    console.error('[admin-validation] Web support reply failed:', err.message);
    res.redirect('/admin/validation?error=webReplySend');
  }
}

module.exports = {
  showValidationLogs,
  resolveValidationLog,
  replyToWhatsAppSupport,
  replyToWebSupport,
};
