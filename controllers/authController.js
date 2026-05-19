const bcrypt = require('bcryptjs');
const authModel = require('../models/authModel');
const qrService = require('../services/qrService');

const ALLOWED_ROLES = ['customer', 'merchant'];

function redirectDashboard(res, user) {
  if (user.role === 'admin') return res.redirect('/admin/dashboard');
  if (user.role === 'merchant') {
    if (user.verification_status === 'pending') return res.redirect('/auth/merchant-pending');
    if (user.verification_status === 'rejected') return res.redirect('/auth/merchant-rejected');
    return res.redirect('/merchant/dashboard');
  }

  return res.redirect('/marketplace');
}

function safeNext(next) {
  return next && next.startsWith('/') && !next.startsWith('//')
    ? next
    : null;
}

function showLogin(req, res) {
  const next = safeNext(req.query.next);
  if (req.session.user) {
    if (req.session.user.role === 'customer' && next) return res.redirect(next);
    return redirectDashboard(res, req.session.user);
  }

  res.render('auth/login', {
    title: 'Login',
    error: null,
    query: req.query
  });
}

function showStartpage(req, res) {
  if (req.session.user) return redirectDashboard(res, req.session.user);

  res.render('auth/Startpage', {
    title: 'Sign up or log in'
  });
}

function showRegister(req, res) {
  const next = safeNext(req.query.next);
  if (req.session.user) {
    if (req.session.user.role === 'customer' && next) return res.redirect(next);
    return redirectDashboard(res, req.session.user);
  }

  res.render('auth/register', {
    title: 'Register',
    error: null,
    query: req.query
  });
}

function showMerchantRegister(req, res) {
  if (req.session.user) return redirectDashboard(res, req.session.user);

  res.render('auth/registerMer', {
    title: 'Register Merchant',
    error: null,
    query: req.query
  });
}

async function login(req, res) {
  const { email, password } = req.body;

  try {
    const user = await authModel.findUserByEmail(email);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.render('auth/login', {
        title: 'Login',
        error: 'Invalid email or password.',
        query: req.query
      });
    }

    req.session.user = {
      user_id: user.user_id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone || '',
      role: user.role
    };

    if (user.role === 'customer') {
      const customer = await authModel.getCustomerByUserId(user.user_id);

      req.session.user.customer_id = customer
        ? customer.customer_id
        : null;
    }

    if (user.role === 'merchant') {
      const merchant = await authModel.getMerchantByUserId(user.user_id);

      req.session.user.merchant_id = merchant
        ? merchant.merchant_id
        : null;

      req.session.user.verification_status = merchant
        ? merchant.verification_status
        : 'pending';

      if (!merchant || merchant.verification_status === 'pending') {
        return res.redirect('/auth/merchant-pending');
      }

      if (merchant.verification_status === 'rejected') {
        return res.redirect('/auth/merchant-rejected');
      }

      return res.redirect('/merchant/dashboard');
    }

    if (user.role === 'admin') {
      return res.redirect('/admin/dashboard');
    }

    const next = safeNext(req.query.next);

    res.redirect(
      next
        ? next
        : '/marketplace'
    );

  } catch (err) {
    console.error(err);

    res.render('auth/login', {
      title: 'Login',
      error: 'Something went wrong. Please try again.',
      query: req.query
    });
  }
}

async function register(req, res) {
  const {
    full_name,
    email,
    password,
    phone,
    role,
    merchant_name,
    business_uen,
    address
  } = req.body;
  const next = safeNext(req.query.next || req.body.next);

  const normalizedPhone = phone && phone.trim()
    ? phone.trim()
    : null;

  const safeRole = ALLOWED_ROLES.includes(role)
    ? role
    : 'customer';

  const registerView = safeRole === 'merchant'
    ? 'auth/registerMer'
    : 'auth/register';

  const registerTitle = safeRole === 'merchant'
    ? 'Register Merchant'
    : 'Register';

  try {
    const existing = await authModel.findUserByEmail(email);

    if (existing) {
      return res.render(registerView, {
        title: registerTitle,
        error: 'That email is already registered. Please log in instead.'
      });
    }

    if (!password || password.length < 6) {
      return res.render(registerView, {
        title: registerTitle,
        error: 'Password must be at least 6 characters.'
      });
    }

    const hash = await bcrypt.hash(password, 10);

    const userId = await authModel.createUser(
      full_name,
      email,
      hash,
      normalizedPhone,
      safeRole
    );

    if (safeRole === 'customer') {
      await authModel.createCustomerProfile(
        userId,
        full_name,
        email,
        normalizedPhone
      );
    }

    if (safeRole === 'merchant') {
      if (!merchant_name || !merchant_name.trim()) {
        return res.render(registerView, {
          title: registerTitle,
          error: 'Please enter your business name.'
        });
      }

      if (!business_uen || !business_uen.trim()) {
        return res.render(registerView, {
          title: registerTitle,
          error: 'Please enter your Business UEN.'
        });
      }

      const merchantId = await authModel.createMerchantProfile(
        userId,
        merchant_name.trim(),
        email,
        normalizedPhone,
        address || '',
        business_uen
      );

      await qrService.ensureMerchantQRCodes(merchantId);
    }

    if (safeRole === 'merchant') {
      return res.redirect('/auth/merchant-pending?submitted=1');
    }

    res.redirect(`/auth/login?registered=1${next ? '&next=' + encodeURIComponent(next) : ''}`);

  } catch (err) {
    console.error(err);

    res.render(registerView, {
      title: registerTitle,
      error: 'Registration failed. Please try again.'
    });
  }
}

function logout(req, res) {
  req.session.destroy(() => res.redirect('/'));
}

function showMerchantPending(req, res) {
  res.render('auth/merchantPending', {
    title: 'Merchant Verification Pending',
    submitted: Boolean(req.query.submitted)
  });
}

function showMerchantRejected(req, res) {
  res.render('auth/merchantRejected', {
    title: 'Merchant Application Rejected'
  });
}

module.exports = {
  showLogin,
  showStartpage,
  showRegister,
  showMerchantRegister,
  showMerchantPending,
  showMerchantRejected,
  login,
  register,
  logout
};
