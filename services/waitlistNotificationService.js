const db = require('../config/db');
const emailService = require('./emailService');
const whatsappNotificationService = require('./whatsappNotificationService');

function appUrl(path) {
  const baseUrl = (process.env.APP_URL || process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  return baseUrl + path;
}

function phoneDigits(phone) {
  return String(phone || '').replace('whatsapp:', '').replace(/\D/g, '');
}

function isLocalWhatsAppEmail(email) {
  return /^whatsapp_\d+@uniday\.local$/i.test(String(email || '').trim());
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

async function hasWhatsAppSession(entry) {
  if (!(await tableExists('whatsapp_session'))) return false;

  const digits = phoneDigits(entry.customer_phone);
  const localDigits = digits.slice(-8);
  const params = [entry.customer_id];
  let phoneClause = '';

  if (digits) {
    phoneClause = `
      OR REPLACE(REPLACE(REPLACE(REPLACE(phone, 'whatsapp:', ''), '+', ''), ' ', ''), '-', '') IN (?, ?)
    `;
    params.push(digits, localDigits);
  }

  const [[row]] = await db.query(
    `SELECT session_id
     FROM whatsapp_session
     WHERE (customer_id = ? ${phoneClause})
       AND status IN ('active', 'completed')
     ORDER BY updated_at DESC, session_id DESC
     LIMIT 1`,
    params
  );

  return Boolean(row);
}

async function hasWhatsAppBooking(entry) {
  const [[row]] = await db.query(
    `SELECT booking_id
     FROM booking
     WHERE customer_id = ?
       AND source = 'whatsapp'
     LIMIT 1`,
    [entry.customer_id]
  );

  return Boolean(row);
}

async function shouldUseWhatsApp(entry) {
  if (!entry || !entry.customer_phone) return false;
  if (isLocalWhatsAppEmail(entry.customer_email)) return true;
  if (await hasWhatsAppBooking(entry)) return true;
  return hasWhatsAppSession(entry);
}

async function sendWaitlistOffer(entry) {
  const confirmUrl = appUrl('/book/viewBookings');
  const enrichedEntry = {
    ...entry,
    offer_minutes: entry.offer_minutes || 15,
  };
  const results = {};

  if (phoneDigits(enrichedEntry.customer_phone)) {
    results.whatsapp = await whatsappNotificationService.sendWaitlistOffer(enrichedEntry, confirmUrl);
    if (results.whatsapp?.error) {
      console.warn('[waitlist] WhatsApp offer failed:', results.whatsapp.error);
    }
  } else {
    results.whatsapp = { skipped: true, reason: 'not_whatsapp_customer' };
  }

  if (isLocalWhatsAppEmail(enrichedEntry.customer_email)) {
    results.email = { skipped: true, reason: 'NO_REAL_EMAIL' };
  } else if (enrichedEntry.customer_email) {
    results.email = await emailService.sendWaitlistOfferEmail(enrichedEntry, confirmUrl);
  } else {
    results.email = { skipped: true, reason: 'NO_EMAIL' };
  }

  return { channel: 'email+whatsapp', results };
}

module.exports = {
  sendWaitlistOffer,
  shouldUseWhatsApp,
};
