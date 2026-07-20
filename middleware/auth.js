const authModel = require('../models/authModel');


function wantsJson(req) {
  return req.xhr
    || req.get('X-Requested-With') === 'XMLHttpRequest'
    || req.get('Accept')?.includes('application/json')
    || req.is('application/json');
}

function requireLogin(req, res, next) {
  if (!req.session.user) {
    if (wantsJson(req)) {
      return res.status(401).json({
        error: 'Authentication required. Please log in again.',
        loginUrl: '/auth/login?next=' + encodeURIComponent(req.originalUrl),
      });
    }

    return res.redirect(
      '/auth/login?next=' + encodeURIComponent(req.originalUrl)
    );
  }

  next();
}

async function requireMerchant(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'merchant') {
    if (wantsJson(req)) {
      return res.status(403).json({ error: 'Access denied. Merchant account required.' });
    }

    return res.status(403).send('Access denied. Merchant account required.');
  }

  try {
    const merchant = await authModel.getMerchantByUserId(req.session.user.user_id);

    if (!merchant || merchant.verification_status === 'pending') {
      if (merchant) {
        req.session.user.merchant_id = merchant.merchant_id;
        req.session.user.verification_status = merchant.verification_status;
      }

      if (wantsJson(req)) {
        return res.status(403).json({
          error: 'Merchant account is still pending approval.',
          redirectUrl: '/auth/merchant-pending',
        });
      }

      return res.redirect('/auth/merchant-pending');
    }

    if (merchant.verification_status === 'rejected') {
      req.session.user.merchant_id = merchant.merchant_id;
      req.session.user.verification_status = merchant.verification_status;
      if (wantsJson(req)) {
        return res.status(403).json({
          error: 'Merchant account has been rejected.',
          redirectUrl: '/auth/merchant-rejected',
        });
      }

      return res.redirect('/auth/merchant-rejected');
    }

    if (!merchant.is_active) {
      req.session.destroy(() => {});
      if (wantsJson(req)) {
        return res.status(403).json({ error: 'This merchant account has been disabled.' });
      }

      return res.status(403).send('This merchant account has been disabled.');
    }

    req.session.user.merchant_id = merchant.merchant_id;
    req.session.user.verification_status = merchant.verification_status;

    if (!merchant.terms_accepted_at) {
      if (wantsJson(req)) {
        return res.status(403).json({
          error: 'Merchant terms must be accepted before continuing.',
          redirectUrl: '/auth/merchant-terms',
        });
      }

      return res.redirect('/auth/merchant-terms');
    }

    next();
  } catch (err) {
    console.error('Merchant verification check failed:', err);
    if (wantsJson(req)) {
      return res.status(500).json({ error: 'Unable to verify merchant account status.' });
    }

    res.status(500).send('Unable to verify merchant account status.');
  }
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    if (wantsJson(req)) {
      return res.status(403).json({ error: 'Access denied. Admin account required.' });
    }

    return res.status(403).send('Access denied. Admin account required.');
  }
  next();
}

function requireCustomer(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'customer') {
    if (wantsJson(req)) {
      return res.status(403).json({ error: 'Access denied. Customer account required.' });
    }
    return res.status(403).send('Access denied. Customer account required.');
  }
  next();
}

function blockMerchantBookingAccess(req, res, next) {
  if (req.session.user && req.session.user.role === 'merchant') {
    if (req.originalUrl.startsWith('/book/api/') || (req.accepts('json') && !req.accepts('html'))) {
      return res.status(403).json({
        error: 'Merchant accounts cannot use customer booking pages.',
      });
    }

    return res.redirect('/merchant/dashboard');
  }

  next();
}

module.exports = {
  requireLogin,
  requireMerchant,
  requireAdmin,
  requireCustomer,
  blockMerchantBookingAccess,
  wantsJson,
};
