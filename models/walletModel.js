const db = require('../config/db');
const PENDING_TOPUP_EXPIRY_HOURS = 24;

async function ensureSchema(connection = db) {
  const [[walletTable]] = await connection.query("SHOW TABLES LIKE 'wallet'");
  const [[transactionsTable]] = await connection.query("SHOW TABLES LIKE 'transactions'");
  if (!walletTable || !transactionsTable) {
    throw new Error('Unified wallet schema is missing. Run database/consolidate_schema.sql first.');
  }
}

async function ensureWallet(customerId, connection = db) {
  await ensureSchema(connection);
  await connection.query(
    `INSERT INTO wallet (customer_id) VALUES (?)
     ON DUPLICATE KEY UPDATE customer_id = VALUES(customer_id)`,
    [customerId]
  );
  const [[wallet]] = await connection.query(
    'SELECT *, money_balance AS balance FROM wallet WHERE customer_id = ?',
    [customerId]
  );
  return wallet;
}

async function getWalletSummary(customerId) {
  const wallet = await ensureWallet(customerId);
  // Stripe top-up attempts normally resolve quickly. Mark abandoned attempts as
  // failed after 24 hours so they do not appear pending forever. A late verified
  // Stripe webhook can still complete and credit the same idempotent transaction.
  await db.query(
    `UPDATE transactions
     SET status = 'failed'
     WHERE wallet_id = ?
       AND asset_type = 'money'
       AND transaction_type = 'topup'
       AND status = 'pending'
       AND created_at < TIMESTAMPADD(HOUR, -?, NOW())`,
    [wallet.wallet_id, PENDING_TOPUP_EXPIRY_HOURS]
  );
  const [transactionRows] = await db.query(
    `SELECT wt.*, b.booking_id
     FROM transactions wt
     LEFT JOIN booking b ON b.booking_id = wt.booking_id
     WHERE wt.wallet_id = ?
       AND wt.asset_type = 'money'
     ORDER BY wt.created_at DESC, wt.transaction_id DESC
     LIMIT 6`,
    [wallet.wallet_id]
  );
  return {
    wallet,
    transactions: transactionRows.slice(0, 5),
    hasMoreTransactions: transactionRows.length > 5,
  };
}

async function getWalletTransactionHistory(customerId, page = 1, pageSize = 20) {
  const wallet = await ensureWallet(customerId);
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safePageSize = Math.min(50, Math.max(1, Number.parseInt(pageSize, 10) || 20));
  const offset = (safePage - 1) * safePageSize;
  const [[countRow]] = await db.query(
    `SELECT COUNT(*) AS total
     FROM transactions
     WHERE wallet_id = ? AND asset_type = 'money'`,
    [wallet.wallet_id]
  );
  const total = Number(countRow.total || 0);
  const [transactions] = await db.query(
    `SELECT wt.*, b.booking_id
     FROM transactions wt
     LEFT JOIN booking b ON b.booking_id = wt.booking_id
     WHERE wt.wallet_id = ?
       AND wt.asset_type = 'money'
     ORDER BY wt.created_at DESC, wt.transaction_id DESC
     LIMIT ? OFFSET ?`,
    [wallet.wallet_id, safePageSize, offset]
  );
  return {
    wallet,
    transactions,
    page: safePage,
    totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    total,
  };
}

async function createPendingTopup(customerId, amount, method, externalReference) {
  const wallet = await ensureWallet(customerId);
  await db.query(
    `INSERT INTO transactions
       (wallet_id, asset_type, transaction_type, amount, status, payment_method, external_reference, idempotency_key, description)
     VALUES (?, 'money', 'topup', ?, 'pending', ?, ?, ?, ?)
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
      'SELECT *, money_balance AS balance FROM wallet WHERE customer_id = ? FOR UPDATE',
      [customerId]
    );
    const key = `topup:${externalReference}`;
    const [[existing]] = await connection.query(
      'SELECT * FROM transactions WHERE idempotency_key = ? FOR UPDATE',
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
        `INSERT INTO transactions
          (wallet_id, asset_type, transaction_type, amount, status, payment_method, external_reference, idempotency_key, description)
         VALUES (?, 'money', 'topup', ?, 'pending', ?, ?, ?, ?)`,
        [wallet.wallet_id, amount, method, externalReference, key, `S$${Number(amount).toFixed(2)} wallet top-up`]
      );
    }
    await connection.query(
      `UPDATE transactions SET status='completed', completed_at=NOW()
       WHERE idempotency_key=?`,
      [key]
    );
    const bonus = getBonusAmount(amount);
    await connection.query(
      `UPDATE wallet
       SET money_balance=money_balance+?, lifetime_topup=lifetime_topup+?, updated_at=NOW()
       WHERE wallet_id=?`,
      [Number(amount) + bonus, amount, wallet.wallet_id]
    );
    if (bonus > 0) {
      await connection.query(
        `INSERT INTO transactions
          (wallet_id, asset_type, transaction_type, amount, status, payment_method, external_reference, idempotency_key, description, completed_at)
         VALUES (?, 'money', 'bonus', ?, 'completed', 'system', ?, ?, ?, NOW())
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
    `UPDATE transactions SET status='failed'
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
      'SELECT *, money_balance AS balance FROM wallet WHERE customer_id=? FOR UPDATE',
      [customerId]
    );
    if (Number(wallet.balance) + 0.0001 < Number(amount)) {
      throw new Error(`Insufficient wallet balance. You need S$${(Number(amount) - Number(wallet.balance)).toFixed(2)} more.`);
    }
    const key = `booking-payment:${bookingId}`;
    const [txResult] = await connection.query(
      `INSERT INTO transactions
        (wallet_id, booking_id, asset_type, transaction_type, amount, status, payment_method, idempotency_key, description, completed_at)
       VALUES (?, ?, 'money', 'payment', ?, 'completed', 'wallet', ?, ?, NOW())`,
      [wallet.wallet_id, bookingId, amount, key, `Payment for booking #${bookingId}`]
    );
    await connection.query(
      `UPDATE wallet SET money_balance=money_balance-?, lifetime_spent=lifetime_spent+?, updated_at=NOW()
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
      'SELECT *, money_balance AS balance FROM wallet WHERE customer_id=? FOR UPDATE',
      [customerId]
    );
    const key = `booking-refund:${bookingId}`;
    const [[existing]] = await connection.query(
      'SELECT * FROM transactions WHERE idempotency_key=? FOR UPDATE',
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
        `INSERT INTO transactions
          (wallet_id, booking_id, asset_type, transaction_type, amount, status, payment_method, idempotency_key, description, completed_at)
         VALUES (?, ?, 'money', 'refund', ?, 'completed', 'wallet', ?, ?, NOW())`,
        [wallet.wallet_id, bookingId, amount, key, `Refund for booking #${bookingId}`]
      );
      await connection.query(
        'UPDATE wallet SET money_balance=money_balance+?, updated_at=NOW() WHERE wallet_id=?',
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
  getWalletTransactionHistory,
  createPendingTopup,
  completeTopup,
  failTopup,
  payBooking,
  refundBooking,
  getBonusAmount,
  PENDING_TOPUP_EXPIRY_HOURS,
};
