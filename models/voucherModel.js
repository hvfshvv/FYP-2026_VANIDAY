const db = require('../config/db');

async function getVoucherCampaigns() {
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
       COUNT(vr.redemption_id) AS redemption_count,
       COALESCE(SUM(vr.discount_amount), 0) AS total_discount_given
     FROM voucher v
     LEFT JOIN merchant m ON v.merchant_id = m.merchant_id
     LEFT JOIN voucher_redemption vr ON v.voucher_id = vr.voucher_id
     GROUP BY
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
       m.merchant_name
     ORDER BY v.start_date DESC, v.voucher_id DESC`
  );

  return rows;
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
     FROM voucher`
  );

  return rows[0] || {
    active_count: 0,
    upcoming_count: 0,
    paused_count: 0,
    expired_count: 0,
  };
}

module.exports = {
  getVoucherCampaigns,
  getApprovedMerchants,
  createVoucherCampaign,
  toggleVoucherStatus,
  getVoucherStatusSummary,
};
