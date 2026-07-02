const db = require('../config/db');

function formatDateOnly(value) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return String(value || '').slice(0, 10);
}

async function getVoucherCampaigns() {
  // Ensure customer_voucher exists so the subqueries below don't fail on a fresh install.
  await ensureCustomerVoucherSchema();

  const [rows] = await db.query(
    `SELECT
       v.voucher_id,
       v.merchant_id,
       v.voucher_code,
       v.voucher_type,
       v.campaign_name,
       v.discount_type,
       v.discount_value,
       v.min_spend,
       v.usage_limit,
       v.usage_per_customer,
       v.start_date,
       v.end_date,
       v.is_active,
       m.merchant_name,
       (SELECT COUNT(*) FROM customer_voucher cv
        WHERE cv.voucher_id = v.voucher_id) AS claim_count,
       (SELECT COUNT(*) FROM customer_voucher cv
        WHERE cv.voucher_id = v.voucher_id AND cv.status = 'used') AS use_count
     FROM voucher v
     LEFT JOIN merchant m ON v.merchant_id = m.merchant_id
     WHERE v.voucher_code NOT LIKE 'LOYALTY\\_%'
     ORDER BY v.start_date DESC, v.voucher_id DESC`
  );

  return rows;
}

async function getVoucherCampaignById(voucherId) {
  const [rows] = await db.query(
    `SELECT *
     FROM voucher
     WHERE voucher_id = ?
       AND voucher_code NOT LIKE 'LOYALTY\\_%'
     LIMIT 1`,
    [voucherId]
  );

  return rows[0] || null;
}

async function getApprovedMerchants() {
  const [rows] = await db.query(
    `SELECT merchant_id, merchant_name
     FROM merchant
     WHERE is_active = 1
       AND verification_status = 'approved'
     ORDER BY merchant_name ASC`
  );

  return rows;
}

async function createVoucherCampaign({
  merchantId,
  voucherCode,
  voucherType,
  campaignName,
  discountType,
  discountValue,
  minSpend,
  usageLimit,
  usagePerCustomer,
  startDate,
  endDate,
}) {
  const [result] = await db.query(
    `INSERT INTO voucher
      (merchant_id, voucher_code, voucher_type, campaign_name, discount_type,
       discount_value, min_spend, usage_limit, usage_per_customer, start_date, end_date, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      merchantId || null,
      voucherCode,
      voucherType,
      campaignName || null,
      discountType,
      discountValue,
      minSpend || null,
      usageLimit || null,
      usagePerCustomer || null,
      startDate,
      endDate,
    ]
  );

  return result.insertId;
}

async function updateVoucherCampaign(voucherId, {
  merchantId,
  voucherCode,
  voucherType,
  campaignName,
  discountType,
  discountValue,
  minSpend,
  usageLimit,
  usagePerCustomer,
  startDate,
  endDate,
}) {
  const [result] = await db.query(
    `UPDATE voucher
     SET merchant_id = ?,
         voucher_code = ?,
         voucher_type = ?,
         campaign_name = ?,
         discount_type = ?,
         discount_value = ?,
         min_spend = ?,
         usage_limit = ?,
         usage_per_customer = ?,
         start_date = ?,
         end_date = ?
     WHERE voucher_id = ?
       AND voucher_code NOT LIKE 'LOYALTY\\_%'`,
    [
      merchantId || null,
      voucherCode,
      voucherType,
      campaignName || null,
      discountType,
      discountValue,
      minSpend || null,
      usageLimit || null,
      usagePerCustomer || null,
      startDate,
      endDate,
      voucherId,
    ]
  );

  return result.affectedRows;
}

async function toggleVoucherStatus(voucherId) {
  await db.query(
    'UPDATE voucher SET is_active = NOT is_active WHERE voucher_id = ?',
    [voucherId]
  );
}

async function getVoucherStatusSummary() {
  const [rows] = await db.query(
    `SELECT
       SUM(CASE WHEN is_active = 1 AND CURDATE() BETWEEN start_date AND end_date THEN 1 ELSE 0 END) AS active_count,
       SUM(CASE WHEN is_active = 1 AND start_date > CURDATE() THEN 1 ELSE 0 END) AS upcoming_count,
       SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS paused_count,
       SUM(CASE WHEN end_date < CURDATE() THEN 1 ELSE 0 END) AS expired_count
     FROM voucher
     WHERE voucher_code NOT LIKE 'LOYALTY\\_%'`
  );

  return rows[0] || {
    active_count: 0,
    upcoming_count: 0,
    paused_count: 0,
    expired_count: 0,
  };
}

// ─── Customer voucher claiming ────────────────────────────────

let customerVoucherSchemaReady = false;

// Creates the customer_voucher table the first time it is needed.
async function ensureCustomerVoucherSchema() {
  if (customerVoucherSchemaReady) return;

  const [[{ cnt }]] = await db.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_voucher'`
  );

  if (!Number(cnt)) {
    await db.query(`
      CREATE TABLE customer_voucher (
        cv_id        INT AUTO_INCREMENT PRIMARY KEY,
        customer_id  INT NOT NULL,
        voucher_id   INT NOT NULL,
        claimed_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        status       ENUM('active','used','expired') DEFAULT 'active',
        used_at      DATETIME NULL,
        INDEX idx_cv_customer (customer_id),
        FOREIGN KEY (customer_id) REFERENCES users(user_id),
        FOREIGN KEY (voucher_id)  REFERENCES voucher(voucher_id)
      )
    `);
  }

  customerVoucherSchemaReady = true;
}

// Returns active, non-expired vouchers with per-customer and global claim flags.
async function getAvailableVouchers(customerId) {
  await ensureCustomerVoucherSchema();

  const [rows] = await db.query(
    `SELECT
       v.voucher_id,
       v.voucher_code,
       v.campaign_name,
       v.discount_type,
       v.discount_value,
       v.min_spend,
       v.usage_limit,
       v.usage_per_customer,
       v.end_date,
       v.voucher_type,
       m.merchant_name,
       (SELECT COUNT(*) FROM customer_voucher cv
        WHERE cv.voucher_id = v.voucher_id AND cv.customer_id = ?) AS customer_claim_count,
       (SELECT COUNT(*) FROM customer_voucher cv2
        WHERE cv2.voucher_id = v.voucher_id) AS total_claim_count
     FROM voucher v
      LEFT JOIN merchant m ON v.merchant_id = m.merchant_id
      WHERE v.is_active = 1
        AND v.start_date <= CURDATE()
        AND v.end_date   >= CURDATE()
        AND v.voucher_code NOT LIKE 'LOYALTY\\_%'
      ORDER BY v.end_date ASC, v.voucher_id ASC`,
    [customerId]
  );

  return rows.map(r => ({
    ...r,
    // Per-customer limit reached (null usage_per_customer means unlimited).
    already_claimed: r.usage_per_customer
      ? Number(r.customer_claim_count) >= Number(r.usage_per_customer)
      : false,
    // Global cap exhausted (null usage_limit means unlimited).
    is_full: r.usage_limit
      ? Number(r.total_claim_count) >= Number(r.usage_limit)
      : false,
  }));
}

async function claimVoucherWithLookup(customerId, {
  lookupSql,
  lookupParams,
  notFoundMessage,
  customerLimitMessage,
}) {
  await ensureCustomerVoucherSchema();

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [[voucher]] = await connection.query(lookupSql, lookupParams);

    if (!voucher)          throw new Error(notFoundMessage);
    if (!voucher.is_active) throw new Error('This voucher is no longer active.');

    const [[{ today }]] = await connection.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today");
    if (formatDateOnly(voucher.start_date) > today) throw new Error('This voucher is not yet available.');
    if (formatDateOnly(voucher.end_date)   < today) throw new Error('This voucher has expired.');

    if (voucher.usage_per_customer) {
      const [[{ claimed }]] = await connection.query(
        'SELECT COUNT(*) AS claimed FROM customer_voucher WHERE customer_id = ? AND voucher_id = ?',
        [customerId, voucher.voucher_id]
      );
      if (Number(claimed) >= voucher.usage_per_customer) {
        throw new Error(customerLimitMessage);
      }
    }

    if (voucher.usage_limit) {
      const [[{ total }]] = await connection.query(
        'SELECT COUNT(*) AS total FROM customer_voucher WHERE voucher_id = ?',
        [voucher.voucher_id]
      );
      if (Number(total) >= voucher.usage_limit) {
        throw new Error('This voucher is fully claimed — no slots remaining.');
      }
    }

    await connection.query(
      'INSERT INTO customer_voucher (customer_id, voucher_id) VALUES (?, ?)',
      [customerId, voucher.voucher_id]
    );

    await connection.commit();
    return voucher;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// Claims a voucher by ID — used when a customer clicks Claim on a browsed voucher.
async function claimVoucherById(customerId, voucherId) {
  return claimVoucherWithLookup(customerId, {
    lookupSql: 'SELECT * FROM voucher WHERE voucher_id = ? FOR UPDATE',
    lookupParams: [voucherId],
    notFoundMessage: 'Voucher not found.',
    customerLimitMessage: 'You have already claimed this voucher.',
  });
}

// Returns vouchers the customer has claimed, newest first.
// display_status accounts for vouchers that expired after claiming.
async function getCustomerVouchers(customerId) {
  await ensureCustomerVoucherSchema();

  const [rows] = await db.query(
    `SELECT
       cv.cv_id,
       cv.claimed_at,
       cv.used_at,
       CASE
         WHEN cv.status = 'used'                         THEN 'used'
         WHEN v.end_date < CURDATE() OR v.is_active = 0  THEN 'expired'
         ELSE 'active'
       END AS display_status,
       v.voucher_id,
       v.voucher_code,
       v.campaign_name,
       v.discount_type,
       v.discount_value,
       v.min_spend,
       v.end_date   AS voucher_expiry,
       v.voucher_type,
       m.merchant_name
     FROM customer_voucher cv
     JOIN voucher  v ON cv.voucher_id  = v.voucher_id
     LEFT JOIN merchant m ON v.merchant_id = m.merchant_id
     WHERE cv.customer_id = ?
     ORDER BY cv.claimed_at DESC`,
    [customerId]
  );

  return rows;
}

// Returns active, unused, non-expired vouchers the customer can apply at checkout.
// Filters to platform-wide (merchant_id IS NULL) or merchant-specific vouchers.
async function getEligibleCustomerVouchers(customerId, merchantId) {
  await ensureCustomerVoucherSchema();

  const [rows] = await db.query(
    `SELECT
       cv.cv_id,
       cv.voucher_id,
       cv.claimed_at,
       cv.status,
       v.voucher_code,
       v.campaign_name,
       v.discount_type,
       v.discount_value,
       v.min_spend,
       v.end_date AS voucher_expiry,
       v.voucher_type,
       m.merchant_name
     FROM customer_voucher cv
     JOIN voucher  v ON cv.voucher_id = v.voucher_id
     LEFT JOIN merchant m ON v.merchant_id = m.merchant_id
     WHERE cv.customer_id = ?
       AND cv.status = 'active'
       AND v.is_active = 1
       AND v.start_date <= CURDATE()
       AND v.end_date >= CURDATE()
       AND (v.merchant_id IS NULL OR v.merchant_id = ?)
     ORDER BY v.end_date ASC`,
    [customerId, merchantId]
  );

  return rows;
}

// Marks a claimed voucher as used after a successful payment.
// Re-validates ownership (customer_id) and active status at write time to prevent
// double-use and cross-customer tampering. Returns true if the row was updated.
async function markVoucherUsed(cvId, customerId) {
  await ensureCustomerVoucherSchema();

  const [result] = await db.query(
    `UPDATE customer_voucher
     SET status = 'used', used_at = NOW()
     WHERE cv_id = ? AND customer_id = ? AND status = 'active'`,
    [cvId, customerId]
  );
  return result.affectedRows > 0;
}

// Claims a voucher by code for a signed-in customer.
// Validates active status, date window, per-customer limit, and global limit.
async function claimVoucher(customerId, voucherCode) {
  return claimVoucherWithLookup(customerId, {
    lookupSql: 'SELECT * FROM voucher WHERE voucher_code = ? FOR UPDATE',
    lookupParams: [voucherCode],
    notFoundMessage: 'Voucher code not found.',
    customerLimitMessage: 'You have already claimed this voucher the maximum number of times.',
  });
}

module.exports = {
  getVoucherCampaigns,
  getVoucherCampaignById,
  getApprovedMerchants,
  createVoucherCampaign,
  updateVoucherCampaign,
  toggleVoucherStatus,
  getVoucherStatusSummary,
  getAvailableVouchers,
  claimVoucherById,
  getCustomerVouchers,
  claimVoucher,
  getEligibleCustomerVouchers,
  markVoucherUsed,
  ensureCustomerVoucherSchema,
};
