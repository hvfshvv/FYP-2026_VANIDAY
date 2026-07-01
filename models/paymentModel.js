const db = require('../config/db');

let paymentHoldSchemaReady = false;

async function ensurePaymentHoldSchema() {
  if (paymentHoldSchemaReady) return;

  const [[column]] = await db.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'payment'
       AND COLUMN_NAME = 'payment_hold_expires_at'`
  );

  if (!Number(column?.count || 0)) {
    try {
      await db.query('ALTER TABLE payment ADD COLUMN payment_hold_expires_at DATETIME NULL AFTER stripe_status');
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }
  }

  paymentHoldSchemaReady = true;
}

async function createPayment(bookingId, amount, method) {
  await ensurePaymentHoldSchema();
  const [result] = await db.query(
    'INSERT INTO payment (booking_id, amount, payment_method) VALUES (?,?,?)',
    [bookingId, amount, method]
  );
  return result.insertId;
}

async function createOrUpdatePayment(bookingId, amount, method, options = {}) {
  await ensurePaymentHoldSchema();
  const holdMinutes = Number.isFinite(Number(options.holdMinutes)) && Number(options.holdMinutes) > 0
    ? Math.ceil(Number(options.holdMinutes))
    : null;

  const [result] = await db.query(
    `INSERT INTO payment (booking_id, amount, payment_method, currency, payment_status, payment_hold_expires_at)
     VALUES (?,?,?, 'sgd', 'pending', CASE WHEN ? IS NULL THEN NULL ELSE DATE_ADD(NOW(), INTERVAL ? MINUTE) END)
     ON DUPLICATE KEY UPDATE
       amount = VALUES(amount),
       payment_method = VALUES(payment_method),
       currency = VALUES(currency),
       payment_status = 'pending',
       payment_hold_expires_at = VALUES(payment_hold_expires_at),
       paid_at = NULL`,
    [bookingId, amount, method, holdMinutes, holdMinutes]
  );
  return result.insertId;
}

async function updatePaymentStatus(bookingId, status, transactionRef) {
  await ensurePaymentHoldSchema();
  const mappedStatus = status === 'success' ? 'paid' : status;
  await db.query(
    `UPDATE payment
     SET payment_status=?,
         transaction_ref=?,
         payment_hold_expires_at=CASE WHEN ? = 'paid' THEN NULL ELSE payment_hold_expires_at END,
         paid_at=CASE WHEN ? = 'paid' THEN NOW() ELSE paid_at END
     WHERE booking_id=?`,
    [mappedStatus, transactionRef, mappedStatus, mappedStatus, bookingId]
  );
}

async function updateStripePaymentDetails(bookingId, details) {
  await ensurePaymentHoldSchema();
  const [result] = await db.query(
    `UPDATE payment
     SET payment_status=?,
         transaction_ref=?,
         payment_ref=?,
         stripe_payment_intent_id=?,
         stripe_checkout_session_id=COALESCE(?, stripe_checkout_session_id),
         stripe_latest_charge_id=?,
         stripe_balance_transaction_id=?,
         stripe_status=?,
         amount=?,
         currency=?,
         receipt_url=?,
         payment_hold_expires_at=CASE WHEN ? = 'paid' THEN NULL ELSE payment_hold_expires_at END,
         paid_at=CASE WHEN ? = 'paid' THEN NOW() ELSE paid_at END
     WHERE booking_id=?`,
    [
      details.paymentStatus,
      details.paymentRef,
      details.paymentRef,
      details.paymentIntentId,
      details.checkoutSessionId || null,
      details.latestChargeId,
      details.balanceTransactionId,
      details.stripeStatus,
      details.amount,
      details.currency,
      details.receiptUrl,
      details.paymentStatus,
      details.paymentStatus,
      bookingId,
    ]
  );
  return result.affectedRows;
}

async function updateStripeCheckoutSession(bookingId, checkoutSessionId, paymentIntentId) {
  await ensurePaymentHoldSchema();
  const [result] = await db.query(
    `UPDATE payment
     SET stripe_checkout_session_id=?,
         payment_ref=COALESCE(payment_ref, ?),
         transaction_ref=COALESCE(transaction_ref, ?),
         stripe_payment_intent_id=COALESCE(stripe_payment_intent_id, ?)
     WHERE booking_id=?`,
    [checkoutSessionId, checkoutSessionId, checkoutSessionId, paymentIntentId || null, bookingId]
  );
  return result.affectedRows;
}

async function getPaymentByBooking(bookingId) {
  await ensurePaymentHoldSchema();
  const [rows] = await db.query('SELECT * FROM payment WHERE booking_id = ?', [bookingId]);
  return rows[0] || null;
}

module.exports = {
  ensurePaymentHoldSchema,
  createPayment,
  createOrUpdatePayment,
  updatePaymentStatus,
  updateStripePaymentDetails,
  updateStripeCheckoutSession,
  getPaymentByBooking,
};
