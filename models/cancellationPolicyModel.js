const db = require('../config/db');

const DEFAULT_POLICY = {
  min_cancel_hours: 6,
  refund_percentage: 100,
  allow_reschedule: 1,
  is_active: 1,
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

  if (!Number.isInteger(hours) || hours < 0 || hours > 168) {
    throw new Error('Minimum cancellation notice must be between 0 and 168 hours.');
  }

  if (!Number.isFinite(refund) || refund < 0 || refund > 100) {
    throw new Error('Refund percentage must be between 0 and 100.');
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

  if (!safePolicy.is_active) {
    return 'This merchant has not published a cancellation policy.';
  }

  const refundLabel = safePolicy.refund_percentage > 0
    ? `${safePolicy.refund_percentage.toFixed(0)}% refund`
    : 'no automatic refund';
  const rescheduleLabel = safePolicy.allow_reschedule
    ? 'Rescheduling is allowed.'
    : 'Rescheduling is not available.';

  return `Cancel at least ${safePolicy.min_cancel_hours} hours before your appointment for ${refundLabel}. ${rescheduleLabel}`;
}

module.exports = {
  DEFAULT_POLICY,
  createDefaultPolicies,
  getPolicyByMerchantId,
  updatePolicy,
  getPolicySummary,
};
