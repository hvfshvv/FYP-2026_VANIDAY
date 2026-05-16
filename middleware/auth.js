const authModel = require('../models/authModel');

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/auth/login');
  next();
}

async function requireMerchant(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'merchant') {
    return res.status(403).send('Access denied. Merchant account required.');
  }

  try {
    const merchant = await authModel.getMerchantByUserId(req.session.user.user_id);

    if (!merchant || merchant.verification_status === 'pending') {
      if (merchant) {
        req.session.user.merchant_id = merchant.merchant_id;
        req.session.user.verification_status = merchant.verification_status;
      }

      return res.redirect('/auth/merchant-pending');
    }

    if (merchant.verification_status === 'rejected') {
      req.session.user.merchant_id = merchant.merchant_id;
      req.session.user.verification_status = merchant.verification_status;
      return res.redirect('/auth/merchant-rejected');
    }

    req.session.user.merchant_id = merchant.merchant_id;
    req.session.user.verification_status = merchant.verification_status;
    next();
  } catch (err) {
    console.error('Merchant verification check failed:', err);
    res.status(500).send('Unable to verify merchant account status.');
  }
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Access denied. Admin account required.');
  }
  next();
}

module.exports = { requireLogin, requireMerchant, requireAdmin };
