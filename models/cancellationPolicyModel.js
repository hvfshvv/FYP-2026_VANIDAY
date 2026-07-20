const db = require('../config/db');

const DEFAULT_POLICY = {
  min_cancel_hours: 6,
  refund_percentage: 95,
  allow_reschedule: 1,
  is_active: 1,
};

const PLATFORM_POLICY = {
  version: '2026-07',
  earlyRefundHours: 24,
  partialRefundHours: 6,
  earlyRefundPercentage: 95,
  partialRefundPercentage: 50,
  lateRefundPercentage: 0,
  merchantCausedRefundPercentage: 100,
};

function normalizePolicy(row = {}) {
  return {
    policy_id: row.policy_id || null,
    merchant_id: row.merchant_id || null,
    min_cancel_hours: Number(row.min_cancel_hours ?? DEFAULT_POLICY.min_cancel_hours),
    refund_percentage: Number(row.refund_percentage ?? DEFAULT_POLICY.refund_percentage),
    allow_reschedule: Number(row.allow_reschedule ?? DEFAULT_POLICY.allow_reschedule) === 1,
    is_active: Number(row.is_active ?? DEFAULT_POLICY.is_active) === 1,
  };
}

function getPlatformPolicyTiers() {
  return [
    {
      label: `More than ${PLATFORM_POLICY.earlyRefundHours} hours before appointment`,
      refundPercentage: PLATFORM_POLICY.earlyRefundPercentage,
    },
    {
      label: `${PLATFORM_POLICY.partialRefundHours} to ${PLATFORM_POLICY.earlyRefundHours} hours before appointment`,
      refundPercentage: PLATFORM_POLICY.partialRefundPercentage,
    },
    {
      label: `Less than ${PLATFORM_POLICY.partialRefundHours} hours before appointment`,
      refundPercentage: PLATFORM_POLICY.lateRefundPercentage,
    },
  ];
}

function hoursUntilAppointment(bookingDate, bookingTime, now = new Date()) {
  const rawDate = bookingDate instanceof Date
    ? `${bookingDate.getFullYear()}-${String(bookingDate.getMonth() + 1).padStart(2, '0')}-${String(bookingDate.getDate()).padStart(2, '0')}`
    : String(bookingDate || '').slice(0, 10);
  const startsAt = new Date(`${rawDate}T${String(bookingTime || '').slice(0, 5)}:00`);
  if (Number.isNaN(startsAt.getTime())) return null;
  return (startsAt.getTime() - now.getTime()) / (60 * 60 * 1000);
}

function getPlatformRefundPercentage(hoursUntil) {
  if (!Number.isFinite(hoursUntil)) return 0;
  if (hoursUntil > PLATFORM_POLICY.earlyRefundHours) return PLATFORM_POLICY.earlyRefundPercentage;
  if (hoursUntil >= PLATFORM_POLICY.partialRefundHours) return PLATFORM_POLICY.partialRefundPercentage;
  return PLATFORM_POLICY.lateRefundPercentage;
}

function calculateCustomerCancellationRefund({ policy, bookingDate, bookingTime, now = new Date() }) {
  const safePolicy = normalizePolicy(policy || DEFAULT_POLICY);
  const hoursUntil = hoursUntilAppointment(bookingDate, bookingTime, now);
  const platformRefund = getPlatformRefundPercentage(hoursUntil);
  const merchantRefundCap = safePolicy.is_active ? Number(safePolicy.refund_percentage) : DEFAULT_POLICY.refund_percentage;
  const merchantNoticeBlocksRefund = safePolicy.is_active
    && Number.isFinite(hoursUntil)
    && hoursUntil < Number(safePolicy.min_cancel_hours || 0);
  const refundPercentage = merchantNoticeBlocksRefund
    ? 0
    : Math.min(platformRefund, merchantRefundCap);

  return {
    hoursUntil,
    refundPercentage: Math.max(0, Math.min(100, Number(refundPercentage) || 0)),
    platformRefundPercentage: platformRefund,
    merchantRefundCap,
    merchantNoticeHours: safePolicy.min_cancel_hours,
    merchantNoticeBlocksRefund,
  };
}

async function createDefaultPolicies(connection = db) {
  await connection.query(
    `UPDATE merchant
     SET min_cancel_hours = COALESCE(min_cancel_hours, ?),
         refund_percentage = COALESCE(refund_percentage, ?),
         allow_reschedule = COALESCE(allow_reschedule, ?),
         cancellation_policy_active = COALESCE(cancellation_policy_active, ?)`,
    [
      DEFAULT_POLICY.min_cancel_hours,
      DEFAULT_POLICY.refund_percentage,
      DEFAULT_POLICY.allow_reschedule,
      DEFAULT_POLICY.is_active,
    ]
  );
}

async function getPolicyByMerchantId(merchantId, connection = db) {
  const [[policy]] = await connection.query(
    `SELECT merchant_id AS policy_id, merchant_id, min_cancel_hours, refund_percentage,
            allow_reschedule, cancellation_policy_active AS is_active
     FROM merchant
     WHERE merchant_id = ?
     LIMIT 1`,
    [merchantId]
  );

  return policy ? normalizePolicy(policy) : null;
}

async function updatePolicy(merchantId, {
  minCancelHours,
  refundPercentage,
  allowReschedule,
  isActive,
}) {
  const hours = Number(minCancelHours);
  const refund = Number(refundPercentage);

  if (!Number.isInteger(hours) || hours < PLATFORM_POLICY.partialRefundHours || hours > 168) {
    throw new Error(`Minimum cancellation notice must be between ${PLATFORM_POLICY.partialRefundHours} and 168 hours.`);
  }

  if (!Number.isFinite(refund) || refund < 0 || refund > PLATFORM_POLICY.earlyRefundPercentage) {
    throw new Error(`Refund percentage must be between 0 and ${PLATFORM_POLICY.earlyRefundPercentage}.`);
  }

  await db.query(
    `UPDATE merchant
     SET min_cancel_hours = ?,
         refund_percentage = ?,
         allow_reschedule = ?,
         cancellation_policy_active = ?
     WHERE merchant_id = ?`,
    [
      hours,
      refund,
      allowReschedule ? 1 : 0,
      isActive ? 1 : 0,
      merchantId,
    ]
  );

  return getPolicyByMerchantId(merchantId);
}

function getPolicySummary(policy) {
  const safePolicy = normalizePolicy(policy);
  const capLabel = safePolicy.is_active
    ? `Merchant maximum refund: ${safePolicy.refund_percentage.toFixed(0)}%.`
    : 'Merchant has not added stricter refund limits.';
  const rescheduleLabel = safePolicy.allow_reschedule
    ? 'Rescheduling is allowed.'
    : 'Rescheduling is not available.';

  return `Uniday cancellation refunds: more than 24 hours = 95%, 6-24 hours = 50%, less than 6 hours or no-show = 0%. Merchant-caused cancellations are 100% refunded. ${capLabel} ${rescheduleLabel}`;
}

module.exports = {
  DEFAULT_POLICY,
  PLATFORM_POLICY,
  createDefaultPolicies,
  getPolicyByMerchantId,
  updatePolicy,
  getPolicySummary,
  getPlatformPolicyTiers,
  calculateCustomerCancellationRefund,
};
