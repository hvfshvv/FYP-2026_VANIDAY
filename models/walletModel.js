const db = require('../config/db');

let schemaReady = false;

async function ensureSchema(connection = db) {
  if (schemaReady) return;
  await connection.query(`CREATE TABLE IF NOT EXISTS payment_wallet (
    wallet_id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL UNIQUE,
    balance DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(3) NOT NULL DEFAULT 'sgd',
    lifetime_topup DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    lifetime_spent DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES users(user_id)
  )`);
  await connection.query(`CREATE TABLE IF NOT EXISTS wallet_transaction (
    wallet_transaction_id INT AUTO_INCREMENT PRIMARY KEY,
    wallet_id INT NOT NULL,
    booking_id INT NULL,
    transaction_type ENUM('topup','payment','refund','bonus') NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    status ENUM('pending','completed','failed') NOT NULL DEFAULT 'pending',
    payment_method ENUM('stripe','paynow','wallet','system') NULL,
    external_reference VARCHAR(255) NULL,
    idempotency_key VARCHAR(255) NOT NULL,
    description VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    UNIQUE KEY uq_wallet_transaction_idempotency (idempotency_key),
    KEY idx_wallet_transaction_wallet_created (wallet_id, created_at),
    KEY idx_wallet_transaction_booking (booking_id),
    FOREIGN KEY (wallet_id) REFERENCES payment_wallet(wallet_id),
    FOREIGN KEY (booking_id) REFERENCES booking(booking_id)
  )`);
  schemaReady = true;
}

async function ensureWallet(customerId, connection = db) {
  await ensureSchema(connection);
  await connection.query(
    `INSERT INTO payment_wallet (customer_id) VALUES (?)
     ON DUPLICATE KEY UPDATE customer_id = VALUES(customer_id)`,
    [customerId]
  );
  const [[wallet]] = await connection.query(
    'SELECT * FROM payment_wallet WHERE customer_id = ?',
    [customerId]
  );
  return wallet;
}

async function getWalletSummary(customerId) {
  const wallet = await ensureWallet(customerId);
  const [transactions] = await db.query(
    `SELECT wt.*, b.booking_id
     FROM wallet_transaction wt
     LEFT JOIN booking b ON b.booking_id = wt.booking_id
     WHERE wt.wallet_id = ?
     ORDER BY wt.created_at DESC, wt.wallet_transaction_id DESC
     LIMIT 30`,
    [wallet.wallet_id]
  );
  return { wallet, transactions };
}

async function createPendingTopup(customerId, amount, method, externalReference) {
  const wallet = await ensureWallet(customerId);
  await db.query(
    `INSERT INTO wallet_transaction
       (wallet_id, transaction_type, amount, status, payment_method, external_reference, idempotency_key, description)
     VALUES (?, 'topup', ?, 'pending', ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE external_reference = VALUES(external_reference)`,
    [wallet.wallet_id, amount, method, externalReference, `topup:${externalReference}`, `S$${Number(amount).toFixed(2)} wallet top-up`]
  );
}

function getBonusAmount(topupAmount) {
  const threshold = Number(process.env.WALLET_BONUS_THRESHOLD || 0);
  const bonus = Number(process.env.WALLET_BONUS_AMOUNT || 0);
  return threshold > 0 && bonus > 0 && Number(topupAmount) >= threshold ? bonus : 0;
}

async function completeTopup({ customerId, amount, method, externalReference }) {
  await ensureSchema();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await ensureWallet(customerId, connection);
    const [[wallet]] = await connection.query(
      'SELECT * FROM payment_wallet WHERE customer_id = ? FOR UPDATE',
      [customerId]
    );
    const key = `topup:${externalReference}`;
    const [[existing]] = await connection.query(
      'SELECT * FROM wallet_transaction WHERE idempotency_key = ? FOR UPDATE',
      [key]
    );
    if (existing && existing.status === 'completed') {
      await connection.commit();
      return { credited: false, wallet, bonus: 0 };
    }
    if (existing && Math.abs(Number(existing.amount) - Number(amount)) > 0.001) {
      throw new Error('Top-up amount does not match the original request.');
    }
    if (!existing) {
      await connection.query(
        `INSERT INTO wallet_transaction
          (wallet_id, transaction_type, amount, status, payment_method, external_reference, idempotency_key, description)
         VALUES (?, 'topup', ?, 'pending', ?, ?, ?, ?)`,
        [wallet.wallet_id, amount, method, externalReference, key, `S$${Number(amount).toFixed(2)} wallet top-up`]
      );
    }
    await connection.query(
      `UPDATE wallet_transaction SET status='completed', completed_at=NOW()
       WHERE idempotency_key=?`,
      [key]
    );
    const bonus = getBonusAmount(amount);
    await connection.query(
      `UPDATE payment_wallet
       SET balance=balance+?, lifetime_topup=lifetime_topup+?, updated_at=NOW()
       WHERE wallet_id=?`,
      [Number(amount) + bonus, amount, wallet.wallet_id]
    );
    if (bonus > 0) {
      await connection.query(
        `INSERT INTO wallet_transaction
          (wallet_id, transaction_type, amount, status, payment_method, external_reference, idempotency_key, description, completed_at)
         VALUES (?, 'bonus', ?, 'completed', 'system', ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE idempotency_key=VALUES(idempotency_key)`,
        [wallet.wallet_id, bonus, externalReference, `${key}:bonus`, `Promotional top-up bonus`]
      );
    }
    await connection.commit();
    const updated = await ensureWallet(customerId);
    return { credited: true, wallet: updated, bonus };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function failTopup(externalReference) {
  await ensureSchema();
  await db.query(
    `UPDATE wallet_transaction SET status='failed'
     WHERE idempotency_key=? AND status='pending'`,
    [`topup:${externalReference}`]
  );
}

async function payBooking({ customerId, bookingId, amount }) {
  await ensureSchema();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[booking]] = await connection.query(
      `SELECT booking_id, customer_id, status FROM booking
       WHERE booking_id=? AND customer_id=? FOR UPDATE`,
      [bookingId, customerId]
    );
    if (!booking) throw new Error('Booking not found.');
    if (booking.status !== 'pending_payment') throw new Error('This booking is no longer payable.');
    await ensureWallet(customerId, connection);
    const [[wallet]] = await connection.query(
      'SELECT * FROM payment_wallet WHERE customer_id=? FOR UPDATE',
      [customerId]
    );
    if (Number(wallet.balance) + 0.0001 < Number(amount)) {
      throw new Error(`Insufficient wallet balance. You need S$${(Number(amount) - Number(wallet.balance)).toFixed(2)} more.`);
    }
    const key = `booking-payment:${bookingId}`;
    const [txResult] = await connection.query(
      `INSERT INTO wallet_transaction
        (wallet_id, booking_id, transaction_type, amount, status, payment_method, idempotency_key, description, completed_at)
       VALUES (?, ?, 'payment', ?, 'completed', 'wallet', ?, ?, NOW())`,
      [wallet.wallet_id, bookingId, amount, key, `Payment for booking #${bookingId}`]
    );
    await connection.query(
      `UPDATE payment_wallet SET balance=balance-?, lifetime_spent=lifetime_spent+?, updated_at=NOW()
       WHERE wallet_id=?`,
      [amount, amount, wallet.wallet_id]
    );
    await connection.query(
      `INSERT INTO payment (booking_id, amount, currency, payment_method, payment_status, transaction_ref, paid_at)
       VALUES (?, ?, 'sgd', 'wallet', 'paid', ?, NOW())
       ON DUPLICATE KEY UPDATE amount=VALUES(amount), payment_method='wallet', payment_status='paid',
         transaction_ref=VALUES(transaction_ref), paid_at=NOW(), payment_hold_expires_at=NULL`,
      [bookingId, amount, `wallet_tx_${txResult.insertId}`]
    );
    await connection.query("UPDATE booking SET status='confirmed' WHERE booking_id=?", [bookingId]);
    await connection.commit();
    return { transactionId: txResult.insertId };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function refundBooking({ customerId, bookingId, refundPercentage = 100 }) {
  await ensureSchema();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[payment]] = await connection.query(
      `SELECT * FROM payment WHERE booking_id=? AND payment_method='wallet' AND payment_status='paid' FOR UPDATE`,
      [bookingId]
    );
    if (!payment) {
      await connection.commit();
      return { refunded: false, reason: 'not_wallet_payment' };
    }
    await ensureWallet(customerId, connection);
    const [[wallet]] = await connection.query(
      'SELECT * FROM payment_wallet WHERE customer_id=? FOR UPDATE',
      [customerId]
    );
    const key = `booking-refund:${bookingId}`;
    const [[existing]] = await connection.query(
      'SELECT * FROM wallet_transaction WHERE idempotency_key=? FOR UPDATE',
      [key]
    );
    if (existing) {
      await connection.commit();
      return { refunded: false, reason: 'already_refunded', amount: Number(existing.amount) };
    }
    const percent = Math.min(100, Math.max(0, Number(refundPercentage)));
    const amount = Number((Number(payment.amount) * percent / 100).toFixed(2));
    if (amount > 0) {
      await connection.query(
        `INSERT INTO wallet_transaction
          (wallet_id, booking_id, transaction_type, amount, status, payment_method, idempotency_key, description, completed_at)
         VALUES (?, ?, 'refund', ?, 'completed', 'wallet', ?, ?, NOW())`,
        [wallet.wallet_id, bookingId, amount, key, `Refund for booking #${bookingId}`]
      );
      await connection.query(
        'UPDATE payment_wallet SET balance=balance+?, updated_at=NOW() WHERE wallet_id=?',
        [amount, wallet.wallet_id]
      );
    }
    const status = amount >= Number(payment.amount) ? 'refunded' : 'partially_refunded';
    await connection.query(
      `UPDATE payment SET payment_status=?, refund_amount=?, refund_status='refunded',
       platform_hold_status='refunded', refunded_at=NOW() WHERE booking_id=?`,
      [status, amount, bookingId]
    );
    await connection.commit();
    return { refunded: true, amount };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = {
  ensureSchema,
  getWalletSummary,
  createPendingTopup,
  completeTopup,
  failTopup,
  payBooking,
  refundBooking,
  getBonusAmount,
};
