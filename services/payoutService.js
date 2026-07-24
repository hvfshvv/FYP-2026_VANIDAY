const payoutModel = require('../models/payoutModel');
const notificationModel = require('../models/notificationModel');
const stripeService = require('./stripeService');

const DAY_MS = 24 * 60 * 60 * 1000;

let schedulerStarted = false;
let running = false;

async function settlePayout(payoutId) {
  const payoutResultBefore = await payoutModel.getPayoutById(payoutId);
  const payout = payoutResultBefore?.payout;
  if (!payout) return false;

  if (process.env.STRIPE_CONNECT_TRANSFERS_ENABLED === 'true') {
    try {
      if (!payout.stripe_account_id) {
        throw new Error('Merchant has not connected a Stripe payout account.');
      }
      if (!Number(payout.stripe_account_details_submitted || 0)) {
        throw new Error('Merchant Stripe payout account onboarding is incomplete.');
      }

      await payoutModel.markPayoutProcessing(payoutId, {
        stripeTransferStatus: 'creating',
        adminNote: 'Creating Stripe Connect transfer.',
      });

      const transfer = await stripeService.createTransferToConnectedAccount({
        amount: payout.payout_amount,
        destinationAccountId: payout.stripe_account_id,
        payoutId,
        merchantId: payout.merchant_id,
      });

      const paidRows = await payoutModel.markPayoutPaid(payoutId, null, {
        payoutReference: transfer.id,
        adminNote: 'Paid through Stripe Connect transfer automation.',
      });

      if (!paidRows) return false;
    } catch (err) {
      await payoutModel.markPayoutFailed(payoutId, err.message);
      console.error(`[payout] Stripe transfer failed for payout ${payoutId}:`, err.message);
      return false;
    }
  } else {
    const paidRows = await payoutModel.markPayoutPaid(payoutId, null, {
      payoutReference: `AUTO-PAYOUT-${payoutId}`,
      adminNote: 'Automatically settled by weekly payout automation.',
    });

    if (!paidRows) return false;
  }

  const payoutResult = await payoutModel.getPayoutById(payoutId);
  if (payoutResult?.payout?.merchant_user_id) {
    await notificationModel.notifyMerchantPayoutCredited({
      merchantUserId: payoutResult.payout.merchant_user_id,
      payoutAmount: payoutResult.payout.payout_amount,
      payoutId,
    });
  }

  return true;
}

async function settlePendingPayouts() {
  const [pending, processing] = await Promise.all([
    payoutModel.getPayouts({ status: 'pending', limit: 500 }),
    payoutModel.getPayouts({ status: 'processing', limit: 500 }),
  ]);
  const payouts = [...pending, ...processing];
  let paid = 0;

  for (const payout of payouts) {
    if (await settlePayout(payout.payout_id)) paid += 1;
  }

  return paid;
}

async function createDueWeeklyPayouts() {
  if (running) return { skipped: true, created: 0, paid: 0 };
  running = true;

  try {
    let paid = await settlePendingPayouts();
    const eligibleGroups = await payoutModel.getEligiblePayoutGroups();
    let created = 0;

    for (const group of eligibleGroups) {
      const result = await payoutModel.createMerchantPayout(group.merchant_id, null);
      if (!result.created) continue;

      created += 1;
      if (await settlePayout(result.payoutId)) paid += 1;
    }

    if (created) {
      console.log(`[payout] Created ${created} and paid ${paid} weekly merchant payout batch(es).`);
    }

    return { skipped: false, created, paid };
  } finally {
    running = false;
  }
}

function startPayoutScheduler() {
  if (schedulerStarted) return null;
  schedulerStarted = true;

  createDueWeeklyPayouts().catch(err => {
    console.error('[payout] Initial weekly payout run failed:', err.message);
  });

  return setInterval(() => {
    createDueWeeklyPayouts().catch(err => {
      console.error('[payout] Weekly payout run failed:', err.message);
    });
  }, DAY_MS);
}

module.exports = {
  createDueWeeklyPayouts,
  startPayoutScheduler,
};
