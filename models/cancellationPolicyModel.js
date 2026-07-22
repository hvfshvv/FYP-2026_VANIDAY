const PLATFORM_POLICY = {
  version: '2026-07',
  earlyRefundHours: 24,
  partialRefundHours: 6,
  rescheduleCutoffHours: 6,
  earlyRefundPercentage: 95,
  partialRefundPercentage: 50,
  lateRefundPercentage: 0,
  merchantCausedRefundPercentage: 100,
};

function normalizePolicy(row = {}) {
  return {
    merchant_id: row.merchant_id || null,
    rescheduleCutoffHours: PLATFORM_POLICY.rescheduleCutoffHours,
    earlyRefundPercentage: PLATFORM_POLICY.earlyRefundPercentage,
    allowReschedule: true,
    is_active: true,
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
  const safePolicy = normalizePolicy(policy || {});
  const hoursUntil = hoursUntilAppointment(bookingDate, bookingTime, now);
  const platformRefund = getPlatformRefundPercentage(hoursUntil);

  return {
    hoursUntil,
    refundPercentage: Math.max(0, Math.min(100, Number(platformRefund) || 0)),
    platformRefundPercentage: platformRefund,
    rescheduleCutoffHours: safePolicy.rescheduleCutoffHours,
  };
}

async function getPolicyByMerchantId(merchantId) {
  return normalizePolicy({ merchant_id: merchantId });
}

function getPolicySummary(policy) {
  const safePolicy = normalizePolicy(policy);
  return `Cancellation refunds: more than 24 hours = ${safePolicy.earlyRefundPercentage.toFixed(0)}%, 6-24 hours = 50%, less than 6 hours or no-show = 0%. Rescheduling is allowed until ${safePolicy.rescheduleCutoffHours} hours before the appointment, subject to merchant availability.`;
}

module.exports = {
  PLATFORM_POLICY,
  getPolicyByMerchantId,
  getPolicySummary,
  getPlatformPolicyTiers,
  calculateCustomerCancellationRefund,
};
