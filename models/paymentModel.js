const db = require('../config/db');

async function createPayment(bookingId, amount, method) {
  const [result] = await db.query(
    'INSERT INTO payment (booking_id, amount, payment_method) VALUES (?,?,?)',
    [bookingId, amount, method]
  );
  return result.insertId;
}

async function createOrUpdatePayment(bookingId, amount, method) {
  const [result] = await db.query(
    `INSERT INTO payment (booking_id, amount, payment_method, currency)
     VALUES (?,?,?, 'sgd')
     ON DUPLICATE KEY UPDATE
       amount = VALUES(amount),
       payment_method = VALUES(payment_method),
       currency = VALUES(currency)`,
    [bookingId, amount, method]
  );
  return result.insertId;
}

async function updatePaymentStatus(bookingId, status, transactionRef) {
  const mappedStatus = status === 'success' ? 'paid' : status;
  await db.query(
    `UPDATE payment
     SET payment_status=?,
         transaction_ref=?,
         paid_at=CASE WHEN ? = 'paid' THEN NOW() ELSE paid_at END
     WHERE booking_id=?`,
    [mappedStatus, transactionRef, mappedStatus, bookingId]
  );
}

async function updateStripePaymentDetails(bookingId, details) {
  const [result] = await db.query(
    `UPDATE payment
     SET payment_status=?,
         transaction_ref=?,
         payment_ref=?,
         stripe_payment_intent_id=?,
         stripe_latest_charge_id=?,
         stripe_balance_transaction_id=?,
         stripe_status=?,
         amount=?,
         currency=?,
         receipt_url=?,
         paid_at=CASE WHEN ? = 'paid' THEN NOW() ELSE paid_at END
     WHERE booking_id=?`,
    [
      details.paymentStatus,
      details.paymentRef,
      details.paymentRef,
      details.paymentIntentId,
      details.latestChargeId,
      details.balanceTransactionId,
      details.stripeStatus,
      details.amount,
      details.currency,
      details.receiptUrl,
      details.paymentStatus,
      bookingId,
    ]
  );
  return result.affectedRows;
}

async function getPaymentByBooking(bookingId) {
  const [rows] = await db.query('SELECT * FROM payment WHERE booking_id = ?', [bookingId]);
  return rows[0] || null;
}

module.exports = {
  createPayment,
  createOrUpdatePayment,
  updatePaymentStatus,
  updateStripePaymentDetails,
  getPaymentByBooking,
};
