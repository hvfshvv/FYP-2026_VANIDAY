const walletModel = require('../models/walletModel');
const {
  createWalletTopupIntent,
  createWalletPayNowSession,
  retrievePaymentIntent,
  retrieveCheckoutSession,
} = require('../services/stripeService');

const ALLOWED_TOPUPS = [10, 20, 50, 100];

function customerId(req) {
  return req.session.user.customer_id || req.session.user.user_id;
}

function requireCustomer(req, res, next) {
  if (!req.session.user) return res.redirect('/auth/login?next=/wallet');
  if (req.session.user.role !== 'customer') return res.status(403).send('Payment wallet is available to customers only.');
  next();
}

function parseAmount(value) {
  const amount = Number(value);
  if (!ALLOWED_TOPUPS.includes(amount)) throw new Error('Choose a valid top-up amount.');
  return amount;
}

function baseUrl(req) {
  return (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

async function showWallet(req, res) {
  try {
    const summary = await walletModel.getWalletSummary(customerId(req));
    const amountDue = Number(req.query.amountDue);
    const bookingId = Number.parseInt(req.query.bookingId, 10);
    const hasPaymentContext = Number.isFinite(amountDue) && amountDue > 0;
    const shortfall = hasPaymentContext
      ? Math.max(amountDue - Number(summary.wallet.balance || 0), 0)
      : 0;
    const suggestedTopup = ALLOWED_TOPUPS.find(amount => amount >= shortfall)
      || ALLOWED_TOPUPS[ALLOWED_TOPUPS.length - 1];

    res.render('wallet/index', {
      title: 'Payment Wallet',
      ...summary,
      allowedTopups: ALLOWED_TOPUPS,
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      bonusThreshold: Number(process.env.WALLET_BONUS_THRESHOLD || 0),
      bonusAmount: Number(process.env.WALLET_BONUS_AMOUNT || 0),
      success: req.query.success || null,
      error: req.query.error || null,
      paymentContext: hasPaymentContext ? {
        amountDue,
        shortfall,
        bookingId: Number.isInteger(bookingId) && bookingId > 0 ? bookingId : null,
      } : null,
      suggestedTopup,
    });
  } catch (err) {
    console.error('showWallet error:', err);
    res.status(500).send('Could not load payment wallet.');
  }
}

async function createCardTopup(req, res) {
  try {
    const amount = parseAmount(req.body.amount);
    const id = customerId(req);
    const intent = await createWalletTopupIntent({ amount, customerId: id });
    await walletModel.createPendingTopup(id, amount, 'stripe', intent.id);
    res.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not start wallet top-up.' });
  }
}

async function createPayNowTopup(req, res) {
  try {
    const amount = parseAmount(req.body.amount);
    const id = customerId(req);
    const session = await createWalletPayNowSession({
      amount,
      customerId: id,
      successUrl: `${baseUrl(req)}/wallet/topup-success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl(req)}/wallet`,
    });
    await walletModel.createPendingTopup(id, amount, 'paynow', session.id);
    res.json({ url: session.url });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not start PayNow top-up.' });
  }
}

async function confirmCardTopup(req, res) {
  try {
    const intent = await retrievePaymentIntent(req.body.paymentIntentId);
    if (intent.metadata?.purpose !== 'wallet_topup' || String(intent.metadata.customer_id) !== String(customerId(req))) {
      return res.status(400).json({ error: 'This top-up does not belong to your wallet.' });
    }
    if (intent.status !== 'succeeded') return res.status(400).json({ error: 'Top-up has not succeeded.' });
    const result = await walletModel.completeTopup({
      customerId: customerId(req),
      amount: Number(intent.amount_received || intent.amount) / 100,
      method: 'stripe',
      externalReference: intent.id,
    });
    res.json({ success: true, bonus: result.bonus, redirectUrl: '/wallet?success=' + encodeURIComponent('Wallet topped up successfully.') });
  } catch (err) {
    console.error('confirmCardTopup error:', err);
    res.status(500).json({ error: 'Could not confirm wallet top-up.' });
  }
}

async function topupSuccess(req, res) {
  try {
    const session = await retrieveCheckoutSession(req.query.session_id);
    if (session.metadata?.purpose !== 'wallet_topup' || String(session.metadata.customer_id) !== String(customerId(req))) {
      return res.redirect('/wallet?error=' + encodeURIComponent('Invalid wallet top-up session.'));
    }
    if (session.payment_status !== 'paid') {
      return res.redirect('/wallet?error=' + encodeURIComponent('Top-up has not completed.'));
    }
    const intent = session.payment_intent;
    const intentId = typeof intent === 'object' ? intent.id : intent;
    const amount = Number(session.amount_total || (typeof intent === 'object' ? intent.amount_received : 0)) / 100;
    await walletModel.completeTopup({ customerId: customerId(req), amount, method: 'paynow', externalReference: session.id });
    res.redirect('/wallet?success=' + encodeURIComponent('Wallet topped up successfully.'));
  } catch (err) {
    console.error('wallet topupSuccess error:', err);
    res.redirect('/wallet?error=' + encodeURIComponent('Could not confirm wallet top-up.'));
  }
}

module.exports = {
  requireCustomer,
  showWallet,
  createCardTopup,
  createPayNowTopup,
  confirmCardTopup,
  topupSuccess,
};
