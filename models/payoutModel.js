const db = require('../config/db');
const paymentModel = require('./paymentModel');
const merchantModel = require('./merchantModel');

const PLATFORM_COMMISSION_RATE = 0.10;
const MERCHANT_SHARE_RATE = 1 - PLATFORM_COMMISSION_RATE;

let payoutSchemaReady = false;

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function thursdayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const daysSinceThursday = (d.getDay() + 3) % 7;
  d.setDate(d.getDate() - daysSinceThursday);
  return d;
}

function localDateKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fillWeeklySeries(rows, weeks, valueKey = 'value') {
  const byWeek = new Map(rows.map(row => [localDateKey(row.week_start), Number(row[valueKey] || 0)]));
  const currentThursday = thursdayOf(new Date());
  const out = [];

  for (let i = weeks - 1; i >= 0; i -= 1) {
    const date = new Date(currentThursday);
    date.setDate(date.getDate() - i * 7);
    const key = localDateKey(date);
    out.push({ week_start: key, value: roundMoney(byWeek.get(key) || 0) });
  }

  return out;
}

function payoutCutoffSql() {
  return 'CURDATE()';
}

function currentPayoutCycleStartSql() {
  return 'DATE_SUB(CURDATE(), INTERVAL MOD(WEEKDAY(CURDATE()) + 4, 7) DAY)';
}

async function ensurePayoutSchema() {
  if (payoutSchemaReady) return;
  await merchantModel.ensureMerchantStripeSchema();

  const paymentColumnExists = async columnName => {
    const [[row]] = await db.query(
      `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'payment'
         AND COLUMN_NAME = ?`,
      [columnName]
    );
    return Number(row?.count || 0) > 0;
  };

  const addPaymentColumnIfMissing = async (columnName, ddl) => {
    if (await paymentColumnExists(columnName)) return;
    try {
      await db.query(ddl);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }
  };
  const tableExists = async tableName => {
    const [[row]] = await db.query(
      `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?`,
      [tableName]
    );
    return Number(row?.count || 0) > 0;
  };

  await addPaymentColumnIfMissing(
    'platform_hold_status',
    "ALTER TABLE payment ADD COLUMN platform_hold_status ENUM('held','released_to_merchant','refunded') DEFAULT 'held'"
  );
  await addPaymentColumnIfMissing(
    'merchant_payout_status',
    "ALTER TABLE payment ADD COLUMN merchant_payout_status ENUM('pending','paid','failed') DEFAULT 'pending' AFTER platform_hold_status"
  );
  await addPaymentColumnIfMissing(
    'merchant_payout_at',
    'ALTER TABLE payment ADD COLUMN merchant_payout_at DATETIME NULL AFTER merchant_payout_status'
  );
  await addPaymentColumnIfMissing(
    'merchant_payout_id',
    'ALTER TABLE payment ADD COLUMN merchant_payout_id INT NULL AFTER merchant_payout_at'
  );
  await addPaymentColumnIfMissing(
    'refund_status',
    "ALTER TABLE payment ADD COLUMN refund_status ENUM('none','pending','refunded','failed') DEFAULT 'none'"
  );
  await addPaymentColumnIfMissing(
    'processor_fee_amount',
    'ALTER TABLE payment ADD COLUMN processor_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER amount'
  );
  await addPaymentColumnIfMissing(
    'dispute_fee_amount',
    'ALTER TABLE payment ADD COLUMN dispute_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER processor_fee_amount'
  );

  await db.query(`
    CREATE TABLE IF NOT EXISTS merchant_payout (
      payout_id INT AUTO_INCREMENT PRIMARY KEY,
      merchant_id INT NOT NULL,
      status ENUM('pending','processing','paid','failed','cancelled') NOT NULL DEFAULT 'pending',
      gross_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      platform_commission DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      processor_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      dispute_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      payout_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      booking_count INT NOT NULL DEFAULT 0,
      payout_period_start DATE NULL,
      payout_period_end DATE NULL,
      currency VARCHAR(8) NOT NULL DEFAULT 'sgd',
      payout_reference VARCHAR(255) NULL,
      admin_note VARCHAR(500) NULL,
      created_by INT NULL,
      paid_by INT NULL,
      paid_at DATETIME NULL,
      failed_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_merchant_payout_merchant_status (merchant_id, status),
      KEY idx_merchant_payout_created (created_at),
      CONSTRAINT fk_merchant_payout_merchant FOREIGN KEY (merchant_id) REFERENCES merchant(merchant_id),
      CONSTRAINT fk_merchant_payout_created_by FOREIGN KEY (created_by) REFERENCES users(user_id),
      CONSTRAINT fk_merchant_payout_paid_by FOREIGN KEY (paid_by) REFERENCES users(user_id)
    )
  `);

  const payoutColumnExists = async (tableName, columnName) => {
    const [[row]] = await db.query(
      `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND COLUMN_NAME = ?`,
      [tableName, columnName]
    );
    return Number(row?.count || 0) > 0;
  };

  const addPayoutColumnIfMissing = async (tableName, columnName, ddl) => {
    if (await payoutColumnExists(tableName, columnName)) return;
    try {
      await db.query(ddl);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }
  };

  await addPayoutColumnIfMissing(
    'merchant_payout',
    'processor_fee_amount',
    'ALTER TABLE merchant_payout ADD COLUMN processor_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER platform_commission'
  );
  await addPayoutColumnIfMissing(
    'merchant_payout',
    'dispute_fee_amount',
    'ALTER TABLE merchant_payout ADD COLUMN dispute_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER processor_fee_amount'
  );
  await addPayoutColumnIfMissing(
    'merchant_payout',
    'payout_period_start',
    'ALTER TABLE merchant_payout ADD COLUMN payout_period_start DATE NULL AFTER booking_count'
  );
  await addPayoutColumnIfMissing(
    'merchant_payout',
    'payout_period_end',
    'ALTER TABLE merchant_payout ADD COLUMN payout_period_end DATE NULL AFTER payout_period_start'
  );
  await addPayoutColumnIfMissing(
    'merchant_payout',
    'stripe_transfer_id',
    'ALTER TABLE merchant_payout ADD COLUMN stripe_transfer_id VARCHAR(255) NULL AFTER payout_reference'
  );
  await addPayoutColumnIfMissing(
    'merchant_payout',
    'stripe_transfer_status',
    'ALTER TABLE merchant_payout ADD COLUMN stripe_transfer_status VARCHAR(64) NULL AFTER stripe_transfer_id'
  );
  await addPayoutColumnIfMissing(
    'merchant_payout',
    'stripe_transfer_error',
    'ALTER TABLE merchant_payout ADD COLUMN stripe_transfer_error TEXT NULL AFTER stripe_transfer_status'
  );
  if (await tableExists('merchant_payout_item')) {
    await db.query(`
      UPDATE payment p
      JOIN merchant_payout_item mpi ON mpi.payment_id = p.payment_id
      SET p.merchant_payout_id = mpi.payout_id
      WHERE p.merchant_payout_id IS NULL
    `);
  }
  payoutSchemaReady = true;
}

function eligibleBookingWhereClause(extra = '') {
  return `
    b.status = 'completed'
    AND p.payment_status = 'paid'
    AND COALESCE(p.refund_status, 'none') = 'none'
    AND COALESCE(p.platform_hold_status, 'held') = 'held'
    AND COALESCE(p.merchant_payout_status, 'pending') = 'pending'
    AND p.merchant_payout_id IS NULL
    AND p.amount > 0
    AND ts.slot_date < ${payoutCutoffSql()}
    AND NOT EXISTS (
      SELECT 1
      FROM merchant_payout weekly_mp
      WHERE weekly_mp.merchant_id = b.merchant_id
        AND weekly_mp.status NOT IN ('failed', 'cancelled')
        AND DATE(weekly_mp.created_at) >= ${currentPayoutCycleStartSql()}
    )
    ${extra}
  `;
}

async function getEligiblePayoutGroups() {
  await ensurePayoutSchema();
  const processorFee = paymentModel.processorFeeExpression('p');

  const [rows] = await db.query(
    `SELECT
       m.merchant_id,
       m.merchant_name,
       m.email,
       COUNT(*) AS booking_count,
       COALESCE(SUM(p.amount), 0) AS gross_amount,
       COALESCE(SUM(ROUND(p.amount * ?, 2)), 0) AS platform_commission,
       COALESCE(SUM(${processorFee}), 0) AS processor_fee_amount,
       COALESCE(SUM(COALESCE(p.dispute_fee_amount, 0)), 0) AS dispute_fee_amount,
       COALESCE(SUM(GREATEST(ROUND(p.amount * ?, 2) - ${processorFee} - COALESCE(p.dispute_fee_amount, 0), 0)), 0) AS payout_amount,
       MIN(ts.slot_date) AS payout_period_start,
       MAX(ts.slot_date) AS payout_period_end,
       MIN(p.paid_at) AS first_paid_at,
       MAX(p.paid_at) AS last_paid_at
     FROM booking b
     JOIN payment p ON p.booking_id = b.booking_id
     JOIN time_slot ts ON ts.slot_id = b.slot_id
     JOIN merchant m ON m.merchant_id = b.merchant_id
     WHERE ${eligibleBookingWhereClause()}
     GROUP BY m.merchant_id, m.merchant_name, m.email
     ORDER BY payout_amount DESC, m.merchant_name ASC`,
    [PLATFORM_COMMISSION_RATE, MERCHANT_SHARE_RATE]
  );

  return rows;
}

async function getEligiblePayoutBookings(merchantId) {
  await ensurePayoutSchema();
  const processorFee = paymentModel.processorFeeExpression('p');

  const [rows] = await db.query(
    `SELECT
       b.booking_id,
       b.merchant_id,
       p.payment_id,
       p.amount AS gross_amount,
       ROUND(p.amount * ?, 2) AS platform_commission,
       ${processorFee} AS processor_fee_amount,
       COALESCE(p.dispute_fee_amount, 0) AS dispute_fee_amount,
       GREATEST(ROUND(p.amount * ?, 2) - ${processorFee} - COALESCE(p.dispute_fee_amount, 0), 0) AS payout_amount,
       p.payment_method,
       p.paid_at,
       ts.slot_date,
       ts.start_time,
       s.service_name,
       u.full_name AS customer_name
     FROM booking b
     JOIN payment p ON p.booking_id = b.booking_id
     JOIN time_slot ts ON ts.slot_id = b.slot_id
     JOIN service s ON s.service_id = b.service_id
     JOIN users u ON u.user_id = b.customer_id
     WHERE ${eligibleBookingWhereClause('AND b.merchant_id = ?')}
     ORDER BY ts.slot_date ASC, ts.start_time ASC, b.booking_id ASC`,
    [PLATFORM_COMMISSION_RATE, MERCHANT_SHARE_RATE, merchantId]
  );

  return rows;
}

async function createMerchantPayout(merchantId, adminUserId) {
  await ensurePayoutSchema();
  const processorFee = paymentModel.processorFeeExpression('p');
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [bookings] = await connection.query(
      `SELECT
         b.booking_id,
         p.payment_id,
         p.amount AS gross_amount,
         ROUND(p.amount * ?, 2) AS platform_commission,
         ${processorFee} AS processor_fee_amount,
         COALESCE(p.dispute_fee_amount, 0) AS dispute_fee_amount,
         GREATEST(ROUND(p.amount * ?, 2) - ${processorFee} - COALESCE(p.dispute_fee_amount, 0), 0) AS payout_amount,
         ts.slot_date
       FROM booking b
       JOIN payment p ON p.booking_id = b.booking_id
       JOIN time_slot ts ON ts.slot_id = b.slot_id
       WHERE ${eligibleBookingWhereClause('AND b.merchant_id = ?')}
       ORDER BY b.booking_id ASC
       FOR UPDATE`,
      [PLATFORM_COMMISSION_RATE, MERCHANT_SHARE_RATE, merchantId]
    );

    if (!bookings.length) {
      await connection.rollback();
      return { created: false, reason: 'no_eligible_bookings' };
    }

    const grossAmount = roundMoney(bookings.reduce((sum, row) => sum + Number(row.gross_amount || 0), 0));
    const platformCommission = roundMoney(bookings.reduce((sum, row) => sum + Number(row.platform_commission || 0), 0));
    const processorFeeAmount = roundMoney(bookings.reduce((sum, row) => sum + Number(row.processor_fee_amount || 0), 0));
    const disputeFeeAmount = roundMoney(bookings.reduce((sum, row) => sum + Number(row.dispute_fee_amount || 0), 0));
    const payoutAmount = roundMoney(bookings.reduce((sum, row) => sum + Number(row.payout_amount || 0), 0));
    const payoutPeriodStart = bookings.reduce((min, row) => {
      const value = row.slot_date;
      return !min || value < min ? value : min;
    }, null);
    const payoutPeriodEnd = bookings.reduce((max, row) => {
      const value = row.slot_date;
      return !max || value > max ? value : max;
    }, null);

    const [payoutResult] = await connection.query(
      `INSERT INTO merchant_payout
         (merchant_id, status, gross_amount, platform_commission, processor_fee_amount, dispute_fee_amount, payout_amount, booking_count, payout_period_start, payout_period_end, created_by)
       VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [merchantId, grossAmount, platformCommission, processorFeeAmount, disputeFeeAmount, payoutAmount, bookings.length, payoutPeriodStart, payoutPeriodEnd, adminUserId || null]
    );

    const payoutId = payoutResult.insertId;
    await connection.query(
      `UPDATE payment
       SET merchant_payout_id = ?
       WHERE payment_id IN (?)`,
      [payoutId, bookings.map(row => row.payment_id)]
    );

    await connection.commit();
    return {
      created: true,
      payoutId,
      bookingCount: bookings.length,
      grossAmount,
      platformCommission,
      payoutAmount,
    };
  } catch (err) {
    await connection.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return { created: false, reason: 'already_in_payout' };
    }
    throw err;
  } finally {
    connection.release();
  }
}

async function getPayoutSummary() {
  await ensurePayoutSchema();

  const [[summary]] = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN status IN ('pending','processing') THEN payout_amount ELSE 0 END), 0) AS outstanding_amount,
       COALESCE(SUM(CASE WHEN status = 'paid' THEN payout_amount ELSE 0 END), 0) AS paid_amount,
       COALESCE(SUM(CASE WHEN status = 'paid' AND DATE(COALESCE(paid_at, created_at)) >= ${currentPayoutCycleStartSql()} THEN payout_amount ELSE 0 END), 0) AS paid_this_week_amount,
       COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending_count,
       COALESCE(SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END), 0) AS paid_count,
       COALESCE(SUM(CASE WHEN status = 'paid' AND DATE(COALESCE(paid_at, created_at)) >= ${currentPayoutCycleStartSql()} THEN 1 ELSE 0 END), 0) AS paid_this_week_count
     FROM merchant_payout`
  );

  const eligible = await getEligiblePayoutGroups();
  return {
    ...summary,
    eligible_amount: eligible.reduce((sum, row) => sum + Number(row.payout_amount || 0), 0),
    eligible_count: eligible.length,
    eligible_booking_count: eligible.reduce((sum, row) => sum + Number(row.booking_count || 0), 0),
  };
}

async function getEligibleWeeklyTrend(weeks = 8) {
  await ensurePayoutSchema();
  const processorFee = paymentModel.processorFeeExpression('p');

  const [rows] = await db.query(
    `SELECT
       DATE_SUB(ts.slot_date, INTERVAL MOD(WEEKDAY(ts.slot_date) + 4, 7) DAY) AS week_start,
       COALESCE(SUM(GREATEST(ROUND(p.amount * ?, 2) - ${processorFee} - COALESCE(p.dispute_fee_amount, 0), 0)), 0) AS value
     FROM booking b
     JOIN payment p ON p.booking_id = b.booking_id
     JOIN time_slot ts ON ts.slot_id = b.slot_id
     WHERE b.status = 'completed'
       AND p.payment_status = 'paid'
       AND COALESCE(p.refund_status, 'none') = 'none'
       AND COALESCE(p.platform_hold_status, 'held') = 'held'
       AND ts.slot_date < ${payoutCutoffSql()}
       AND ts.slot_date >= DATE_SUB(${currentPayoutCycleStartSql()}, INTERVAL ? WEEK)
     GROUP BY week_start
     ORDER BY week_start ASC`,
    [MERCHANT_SHARE_RATE, Math.max(1, Math.min(Number(weeks) || 8, 26))]
  );

  return fillWeeklySeries(rows, Math.max(1, Math.min(Number(weeks) || 8, 26)));
}

async function getOutstandingBreakdown(limit = 5) {
  await ensurePayoutSchema();

  const [rows] = await db.query(
    `SELECT mp.merchant_id, m.merchant_name, mp.payout_amount
     FROM merchant_payout mp
     JOIN merchant m ON m.merchant_id = mp.merchant_id
     WHERE mp.status IN ('pending','processing')
     ORDER BY mp.payout_amount DESC
     LIMIT ?`,
    [Math.max(1, Math.min(Number(limit) || 5, 20))]
  );

  return rows;
}

async function getEligibleMerchantSizeBuckets() {
  const groups = await getEligiblePayoutGroups();
  const buckets = [
    { label: '1-2 bookings', min: 1, max: 2, count: 0 },
    { label: '3-5 bookings', min: 3, max: 5, count: 0 },
    { label: '6+ bookings', min: 6, max: Infinity, count: 0 },
  ];

  groups.forEach(row => {
    const count = Number(row.booking_count || 0);
    const bucket = buckets.find(item => count >= item.min && count <= item.max);
    if (bucket) bucket.count += 1;
  });

  return buckets;
}

async function getPayouts({ merchantId = null, status = null, limit = 100 } = {}) {
  await ensurePayoutSchema();
  const clauses = [];
  const params = [];

  if (merchantId) {
    clauses.push('mp.merchant_id = ?');
    params.push(merchantId);
  }

  if (status) {
    clauses.push('mp.status = ?');
    params.push(status);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(Math.max(1, Math.min(Number(limit) || 100, 500)));

  const [rows] = await db.query(
    `SELECT mp.*, m.merchant_name, m.email AS merchant_email, m.user_id AS merchant_user_id,
            m.stripe_account_id, m.stripe_account_payouts_enabled, m.stripe_account_details_submitted
     FROM merchant_payout mp
     JOIN merchant m ON m.merchant_id = mp.merchant_id
     ${where}
     ORDER BY mp.created_at DESC, mp.payout_id DESC
     LIMIT ?`,
    params
  );

  return rows;
}

async function getPayoutById(payoutId) {
  await ensurePayoutSchema();
  const processorFee = paymentModel.processorFeeExpression('p');

  const [[payout]] = await db.query(
    `SELECT mp.*, m.merchant_name, m.email AS merchant_email, m.user_id AS merchant_user_id,
            m.stripe_account_id, m.stripe_account_payouts_enabled, m.stripe_account_details_submitted
     FROM merchant_payout mp
     JOIN merchant m ON m.merchant_id = mp.merchant_id
     WHERE mp.payout_id = ?
     LIMIT 1`,
    [payoutId]
  );

  if (!payout) return null;

  const [items] = await db.query(
    `SELECT
       b.booking_id,
       p.payment_id,
       p.amount AS gross_amount,
       ROUND(p.amount * ?, 2) AS platform_commission,
       ${processorFee} AS processor_fee_amount,
       COALESCE(p.dispute_fee_amount, 0) AS dispute_fee_amount,
       GREATEST(ROUND(p.amount * ?, 2) - ${processorFee} - COALESCE(p.dispute_fee_amount, 0), 0) AS payout_amount,
       s.service_name,
       ts.slot_date,
       ts.start_time,
       u.full_name AS customer_name
     FROM payment p
     JOIN booking b ON b.booking_id = p.booking_id
     JOIN service s ON s.service_id = b.service_id
     JOIN time_slot ts ON ts.slot_id = b.slot_id
     JOIN users u ON u.user_id = b.customer_id
     WHERE p.merchant_payout_id = ?
     ORDER BY ts.slot_date ASC, ts.start_time ASC`,
    [PLATFORM_COMMISSION_RATE, MERCHANT_SHARE_RATE, payoutId]
  );

  return { payout, items };
}

async function markPayoutProcessing(payoutId, { stripeTransferStatus = null, adminNote = null } = {}) {
  await ensurePayoutSchema();
  const [result] = await db.query(
    `UPDATE merchant_payout
     SET status = 'processing',
         stripe_transfer_status = ?,
         admin_note = COALESCE(?, admin_note)
     WHERE payout_id = ?
       AND status = 'pending'`,
    [
      stripeTransferStatus ? String(stripeTransferStatus).slice(0, 64) : null,
      adminNote ? String(adminNote).slice(0, 500) : null,
      payoutId,
    ]
  );
  return result.affectedRows;
}

async function markPayoutPaid(payoutId, adminUserId, { payoutReference = null, adminNote = null } = {}) {
  await ensurePayoutSchema();
  const connection = await db.getConnection();
  const transferId = payoutReference && String(payoutReference).startsWith('tr_')
    ? String(payoutReference).slice(0, 255)
    : null;

  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      `UPDATE merchant_payout
       SET status = 'paid',
           payout_reference = ?,
           stripe_transfer_id = COALESCE(?, stripe_transfer_id),
           stripe_transfer_status = COALESCE(?, stripe_transfer_status),
           stripe_transfer_error = NULL,
           admin_note = ?,
           paid_by = ?,
           paid_at = NOW()
       WHERE payout_id = ?
         AND status IN ('pending','processing')`,
      [
        payoutReference ? String(payoutReference).slice(0, 255) : null,
        transferId,
        transferId ? 'created' : null,
        adminNote ? String(adminNote).slice(0, 500) : null,
        adminUserId || null,
        payoutId,
      ]
    );

    if (result.affectedRows) {
      await connection.query(
        `UPDATE payment
         SET platform_hold_status = 'released_to_merchant',
             merchant_payout_status = 'paid',
             merchant_payout_at = NOW()
         WHERE merchant_payout_id = ?`,
        [payoutId]
      );
    }

    await connection.commit();
    return result.affectedRows;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function markPayoutFailed(payoutId, errorMessage) {
  await ensurePayoutSchema();
  const [result] = await db.query(
    `UPDATE merchant_payout
     SET status = 'failed',
         stripe_transfer_status = 'failed',
         stripe_transfer_error = ?
     WHERE payout_id = ?
       AND status IN ('pending','processing')`,
    [String(errorMessage || 'Stripe transfer failed').slice(0, 1000), payoutId]
  );
  return result.affectedRows;
}

async function getMerchantPayoutOverview(merchantId) {
  await ensurePayoutSchema();

  const [eligibleBookings, payouts] = await Promise.all([
    getEligiblePayoutBookings(merchantId),
    getPayouts({ merchantId, limit: 100 }),
  ]);

  return {
    eligibleBookings,
    eligibleGross: roundMoney(eligibleBookings.reduce((sum, row) => sum + Number(row.gross_amount || 0), 0)),
    eligibleCommission: roundMoney(eligibleBookings.reduce((sum, row) => sum + Number(row.platform_commission || 0), 0)),
    eligibleAmount: roundMoney(eligibleBookings.reduce((sum, row) => sum + Number(row.payout_amount || 0), 0)),
    payouts,
  };
}

module.exports = {
  PLATFORM_COMMISSION_RATE,
  MERCHANT_SHARE_RATE,
  ensurePayoutSchema,
  getEligiblePayoutGroups,
  getEligiblePayoutBookings,
  createMerchantPayout,
  getPayoutSummary,
  getEligibleWeeklyTrend,
  getOutstandingBreakdown,
  getEligibleMerchantSizeBuckets,
  getPayouts,
  getPayoutById,
  markPayoutProcessing,
  markPayoutPaid,
  markPayoutFailed,
  getMerchantPayoutOverview,
};
