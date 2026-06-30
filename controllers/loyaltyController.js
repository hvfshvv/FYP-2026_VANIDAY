const loyaltyModel = require('../models/loyaltyModel');
const voucherModel = require('../models/voucherModel');

// Only signed-in customers should be able to view or redeem wallet rewards.
function requireCustomer(req, res) {
  if (!req.session.user) {
    res.redirect('/auth/login?next=' + encodeURIComponent(req.originalUrl));
    return false;
  }

  if (req.session.user.role !== 'customer') {
    res.status(403).send('Loyalty wallet is only available for signed-in customer accounts.');
    return false;
  }

  return true;
}

// Loyalty tables use users.user_id as customer_id.
function getCustomerId(req) {
  return req.session.user.user_id;
}

// Loads all wallet data needed by views/customer/loyaltyWallet.ejs.
async function showWallet(req, res) {
  if (!requireCustomer(req, res)) return;

  try {
    const customerId = getCustomerId(req);
    await loyaltyModel.syncMissingBookingPointsForCustomer(customerId);
    const [summary, claimedVouchers, availableVouchers] = await Promise.all([
      loyaltyModel.getWalletSummary(customerId),
      voucherModel.getCustomerVouchers(customerId),
      voucherModel.getAvailableVouchers(customerId),
    ]);
    res.render('customer/loyaltyWallet', {
      title: 'Loyalty Wallet',
      ...summary,
      claimedVouchers,
      availableVouchers,
      success: req.query.success || null,
      error: req.query.error || null,
    });
  } catch (err) {
    console.error(err);
    res.render('customer/loyaltyWallet', {
      title: 'Loyalty Wallet',
      wallet: { points_balance: 0, lifetime_points_earned: 0, lifetime_points_redeemed: 0 },
      tier: { name: 'Bronze', icon: 'bi-shield-check', lifetimeSpend: 0, nextTier: null, spendToNextTier: 0 },
      tiers: [],
      rewards: [],
      transactions: [],
      claimedVouchers: [],
      availableVouchers: [],
      success: null,
      error: 'Could not load your loyalty wallet. Please try again.',
    });
  }
}

// Redeems one reward and sends the user back with a success/error message.
async function redeemReward(req, res) {
  if (!requireCustomer(req, res)) return;

  try {
    const reward = await loyaltyModel.redeemReward(getCustomerId(req), req.params.rewardId);
    res.redirect(`/loyalty?success=${encodeURIComponent(`${reward.title} redeemed. Show this in your transaction history when using the voucher.`)}`);
  } catch (err) {
    console.error(err);
    res.redirect(`/loyalty?error=${encodeURIComponent(err.message || 'Could not redeem reward.')}`);
  }
}

// Claims a voucher by ID when the customer clicks Claim on the browse section.
async function claimVoucherById(req, res) {
  if (!requireCustomer(req, res)) return;

  const voucherId = parseInt(req.params.voucherId, 10);
  if (!voucherId) {
    return res.redirect('/loyalty?error=' + encodeURIComponent('Invalid voucher.'));
  }

  try {
    const voucher = await voucherModel.claimVoucherById(getCustomerId(req), voucherId);
    const name = voucher.campaign_name || voucher.voucher_code;
    res.redirect('/loyalty?success=' + encodeURIComponent(`"${name}" has been added to your wallet.`));
  } catch (err) {
    console.error(err);
    res.redirect('/loyalty?error=' + encodeURIComponent(err.message || 'Could not claim voucher.'));
  }
}

// Claims a voucher by code for the signed-in customer.
async function claimVoucher(req, res) {
  if (!requireCustomer(req, res)) return;

  const code = (req.body.voucherCode || '').trim();
  if (!code) {
    return res.redirect('/loyalty?error=' + encodeURIComponent('Please enter a voucher code.'));
  }

  try {
    const voucher = await voucherModel.claimVoucher(getCustomerId(req), code);
    const name = voucher.campaign_name || voucher.voucher_code;
    res.redirect('/loyalty?success=' + encodeURIComponent(`"${name}" has been added to your wallet.`));
  } catch (err) {
    console.error(err);
    res.redirect('/loyalty?error=' + encodeURIComponent(err.message || 'Could not claim voucher.'));
  }
}

module.exports = {
  showWallet,
  redeemReward,
  claimVoucherById,
  claimVoucher,
};
