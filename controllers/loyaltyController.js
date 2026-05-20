const loyaltyModel = require('../models/loyaltyModel');

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

// Customer id is normally stored on the session after login.
function getCustomerId(req) {
  return req.session.user.customer_id || req.session.user.user_id;
}

// Loads all wallet data needed by views/customer/loyaltyWallet.ejs.
async function showWallet(req, res) {
  if (!requireCustomer(req, res)) return;

  try {
    const summary = await loyaltyModel.getWalletSummary(getCustomerId(req));
    res.render('customer/loyaltyWallet', {
      title: 'Loyalty Wallet',
      ...summary,
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

module.exports = {
  showWallet,
  redeemReward,
};
