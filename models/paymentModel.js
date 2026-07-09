const db = require('../config/db');

let paymentHoldSchemaReady = false;

async function ensurePaymentHoldSchema() {
  if (paymentHoldSchemaReady) return;

  const hasColumn = async columnName => {
    const [[column]] = await db.query(
      `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'payment'
         AND COLUMN_NAME = ?`,
      [columnName]
    );
    return Number(column?.count || 0) > 0;
  };

  const addColumnIfMissing = async (columnName, ddl) => {
    if (await hasColumn(columnName)) return;
    try {
      await db.query(ddl);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }
  };

  await addColumnIfMissing(
    'payment_hold_expires_at',
    'ALTER TABLE payment ADD COLUMN payment_hold_expires_at DATETIME NULL AFTER stripe_status'
  );
  await addColumnIfMissing(
    'stripe_refund_id',
    'ALTER TABLE payment ADD COLUMN stripe_refund_id VARCHAR(255) NULL AFTER refund_amount'
  );
  await addColumnIfMissing(
    'stripe_refund_status',
    'ALTER TABLE payment ADD COLUMN stripe_refund_status VARCHAR(64) NULL AFTER stripe_refund_id'
  );

  paymentHoldSchemaReady = true;
}

async function ensurePaymentRefundSchema() {
  await ensurePaymentHoldSchema();
}

async function getRefundedAmount(bookingId) {
  await ensurePaymentRefundSchema();
  const [[row]] = await db.query(
    'SELECT COALESCE(refund_amount, 0) AS refund_amount FROM payment WHERE booking_id = ?',
    [bookingId]
  );
  return Number(row?.refund_amount || 0);
}

async function markRefundPending(bookingId, amount) {
  await ensurePaymentRefundSchema();
  await db.query(
    `UPDATE payment
     SET refund_status = 'pending',
         refund_amount = COALESCE(refund_amount, 0) + ?,
         stripe_refund_status = NULL
     WHERE booking_id = ?`,
    [amount, bookingId]
  );
}

async function markRefundFailed(bookingId, failedAmount, reason = null) {
  await ensurePaymentRefundSchema();
  await db.query(
    `UPDATE payment
     SET refund_status = 'failed',
         refund_amount = GREATEST(COALESCE(refund_amount, 0) - ?, 0),
         stripe_refund_status = ?
     WHERE booking_id = ?`,
    [failedAmount, reason ? String(reason).slice(0, 64) : 'failed', bookingId]
  );
}

async function markRefundSucceeded(bookingId, {
  stripeRefundId,
  stripeRefundStatus,
  totalRefundedAmount,
  originalPaymentAmount,
}) {
  await ensurePaymentRefundSchema();
  const paymentStatus = Number(totalRefundedAmount) >= Number(originalPaymentAmount) - 0.01
    ? 'refunded'
    : 'partially_refunded';

  await db.query(
    `UPDATE payment
     SET payment_status = ?,
         platform_hold_status = 'refunded',
         refund_status = 'refunded',
         refund_amount = ?,
         stripe_refund_id = ?,
         stripe_refund_status = ?,
         refunded_at = NOW()
     WHERE booking_id = ?`,
    [
      paymentStatus,
      totalRefundedAmount,
      stripeRefundId,
      stripeRefundStatus,
      bookingId,
    ]
  );
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
  ensurePaymentRefundSchema,
  createPayment,
  createOrUpdatePayment,
  updatePaymentStatus,
  updateStripePaymentDetails,
  updateStripeCheckoutSession,
  getPaymentByBooking,
  getRefundedAmount,
  markRefundPending,
  markRefundFailed,
  markRefundSucceeded,
};
