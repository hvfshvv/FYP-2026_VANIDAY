const walletModel = require('../models/walletModel');
const {
  createWalletTopupIntent,
  createWalletPayNowSession,
  retrievePaymentIntent,
  retrieveCheckoutSession,
} = require('../services/stripeService');

const ALLOWED_TOPUPS = [10, 20, 50, 100];
const MIN_TOPUP = 5;
const MAX_TOPUP = 500;

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
  const amountInCents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || Math.abs((amount * 100) - amountInCents) > Number.EPSILON * 100) {
    throw new Error('Enter a valid top-up amount with no more than two decimal places.');
  }
  const normalizedAmount = amountInCents / 100;
  if (normalizedAmount < MIN_TOPUP || normalizedAmount > MAX_TOPUP) {
    throw new Error(`Top-up amount must be between S$${MIN_TOPUP.toFixed(2)} and S$${MAX_TOPUP.toFixed(2)}.`);
  }
  return normalizedAmount;
}

function baseUrl(req) {
  return (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

function returnToPaymentQuery(source = {}) {
  const bookingId = Number.parseInt(source.bookingId, 10);
  const amountDue = Number(source.amountDue);
  if (!Number.isInteger(bookingId) || bookingId <= 0 || !Number.isFinite(amountDue) || amountDue <= 0) {
    return '';
  }
  return `&bookingId=${encodeURIComponent(bookingId)}&amountDue=${encodeURIComponent(amountDue.toFixed(2))}`;
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
    const exactShortfall = shortfall > 0 && shortfall <= MAX_TOPUP
      ? Math.max(MIN_TOPUP, Math.ceil(shortfall * 100) / 100)
      : null;
    const suggestedTopup = exactShortfall
      || ALLOWED_TOPUPS.find(amount => amount >= shortfall)
      || ALLOWED_TOPUPS[0];
    const paymentContext = hasPaymentContext ? {
      amountDue,
      shortfall,
      bookingId: Number.isInteger(bookingId) && bookingId > 0 ? bookingId : null,
    } : null;
    const historyQuery = paymentContext
      ? returnToPaymentQuery(paymentContext).replace(/^&/, '?')
      : '';

    res.render('wallet/index', {
      title: 'Payment Wallet',
      ...summary,
      allowedTopups: ALLOWED_TOPUPS,
      minTopup: MIN_TOPUP,
      maxTopup: MAX_TOPUP,
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      bonusThreshold: Number(process.env.WALLET_BONUS_THRESHOLD || 0),
      bonusAmount: Number(process.env.WALLET_BONUS_AMOUNT || 0),
      success: req.query.success || null,
      error: req.query.error || null,
      paymentContext,
      walletHistoryUrl: `/wallet/history${historyQuery}`,
      suggestedTopup,
      exactShortfall,
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
    const paymentQuery = returnToPaymentQuery(req.body);
    const session = await createWalletPayNowSession({
      amount,
      customerId: id,
      successUrl: `${baseUrl(req)}/wallet/topup-success?session_id={CHECKOUT_SESSION_ID}${paymentQuery}`,
      cancelUrl: `${baseUrl(req)}/wallet?cancelled=1${paymentQuery}`,
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
  const paymentQuery = returnToPaymentQuery(req.query);
  try {
    const session = await retrieveCheckoutSession(req.query.session_id);
    if (session.metadata?.purpose !== 'wallet_topup' || String(session.metadata.customer_id) !== String(customerId(req))) {
      return res.redirect('/wallet?error=' + encodeURIComponent('Invalid wallet top-up session.') + paymentQuery);
    }
    if (session.payment_status !== 'paid') {
      return res.redirect('/wallet?error=' + encodeURIComponent('Top-up has not completed.') + paymentQuery);
    }
    const intent = session.payment_intent;
    const intentId = typeof intent === 'object' ? intent.id : intent;
    const amount = Number(session.amount_total || (typeof intent === 'object' ? intent.amount_received : 0)) / 100;
    await walletModel.completeTopup({ customerId: customerId(req), amount, method: 'paynow', externalReference: session.id });
    res.redirect('/wallet?success=' + encodeURIComponent('Wallet topped up successfully.') + paymentQuery);
  } catch (err) {
    console.error('wallet topupSuccess error:', err);
    res.redirect('/wallet?error=' + encodeURIComponent('Could not confirm wallet top-up.') + paymentQuery);
  }
}

async function showHistory(req, res) {
  try {
    const history = await walletModel.getWalletTransactionHistory(customerId(req), req.query.page, 20);
    const paymentQuery = returnToPaymentQuery(req.query);
    res.render('wallet/history', {
      title: 'Wallet Activity',
      ...history,
      walletReturnUrl: `/wallet${paymentQuery ? `?${paymentQuery.slice(1)}` : ''}`,
      paymentQuery,
    });
  } catch (err) {
    console.error('showWalletHistory error:', err);
    res.status(500).send('Could not load wallet activity.');
  }
}

module.exports = {
  requireCustomer,
  showWallet,
  showHistory,
  createCardTopup,
  createPayNowTopup,
  confirmCardTopup,
  topupSuccess,
  parseAmount,
  MIN_TOPUP,
  MAX_TOPUP,
  returnToPaymentQuery,
};
