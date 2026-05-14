function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/auth/login');
  next();
}

function requireMerchant(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'merchant') {
    return res.status(403).send('Access denied. Merchant account required.');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Access denied. Admin account required.');
  }
  next();
}

module.exports = { requireLogin, requireMerchant, requireAdmin };
