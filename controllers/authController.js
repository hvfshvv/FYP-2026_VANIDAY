const bcrypt = require('bcryptjs');
const authModel = require('../models/authModel');
const qrService = require('../services/qrService');
const emailService = require('../services/emailService');

const ALLOWED_ROLES = ['customer', 'merchant'];

function redirectDashboard(res, user) {
  if (user.role === 'admin') return res.redirect('/admin/dashboard');
  if (user.role === 'merchant') {
    if (user.verification_status === 'pending') return res.redirect('/auth/merchant-pending');
    if (user.verification_status === 'rejected') return res.redirect('/auth/merchant-rejected');
    return res.redirect('/merchant/dashboard');
  }

  return res.redirect('/');
}

function safeNext(next) {
  return next && next.startsWith('/') && !next.startsWith('//')
    ? next
    : null;
}

function getBaseUrl(req) {
  return (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

async function sendVerificationEmail(req, user) {
  const token = await authModel.createEmailVerificationToken(user.user_id);
  const verificationUrl = `${getBaseUrl(req)}/auth/verify-email/${token}`;

  try {
    const result = await emailService.sendEmailVerificationEmail(user, verificationUrl);
    return {
      ...result,
      verificationUrl,
    };
  } catch (err) {
    console.error('email verification send failed:', err);
    console.log(`Email verification link for ${user.email}: ${verificationUrl}`);
    return { sent: false, verificationUrl };
  }
}

async function buildSessionUser(user) {
  const sessionUser = {
    user_id: user.user_id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone || '',
    role: user.role
  };

  if (user.role === 'customer') {
    const customer = await authModel.getCustomerByUserId(user.user_id);
    sessionUser.customer_id = customer ? customer.customer_id : null;
  }

  if (user.role === 'merchant') {
    const merchant = await authModel.getMerchantByUserId(user.user_id);
    sessionUser.merchant_id = merchant ? merchant.merchant_id : null;
    sessionUser.verification_status = merchant ? merchant.verification_status : 'pending';
  }

  return sessionUser;
}

function finishLogin(req, res, user, next) {
  req.session.user = user;

  if (user.role === 'merchant') {
    if (user.verification_status === 'pending') return res.redirect('/auth/merchant-pending');
    if (user.verification_status === 'rejected') return res.redirect('/auth/merchant-rejected');
    return res.redirect('/merchant/dashboard');
  }

  if (user.role === 'admin') {
    return res.redirect('/admin/dashboard');
  }

  res.redirect(next ? next : '/');
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
    query: req.query,
    verificationLink: null
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
  const next = safeNext(req.query.next || req.body.next);

  try {
    const user = await authModel.findUserByEmail(email);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.render('auth/login', {
        title: 'Login',
        error: 'Invalid email or password.',
        query: req.query,
        verificationLink: null
      });
    }

    if (user.status === 'suspended') {
      return res.render('auth/login', {
        title: 'Login',
        error: 'This account has been disabled. Please contact support.',
        query: req.query,
        verificationLink: null
      });
    }

    if (!user.email_verified_at) {
      const verificationResult = await sendVerificationEmail(req, user);

      return res.render('auth/login', {
        title: 'Login',
        error: verificationResult.sent
          ? 'Please verify your email before signing in. A new verification link has been sent.'
          : 'Please verify your email before signing in. Email is not configured, so use the local verification link below.',
        query: req.query,
        verificationLink: verificationResult.sent ? null : verificationResult.verificationUrl
      });
    }

    const sessionUser = await buildSessionUser(user);
    finishLogin(req, res, sessionUser, next);

  } catch (err) {
    console.error(err);

    res.render('auth/login', {
      title: 'Login',
      error: 'Something went wrong. Please try again.',
      query: req.query,
      verificationLink: null
    });
  }
}

async function register(req, res) {
  const {
    full_name,
    email,
    password,
    phone,
    date_of_birth,
    role,
    merchant_name,
    business_uen,
    address,
    category
  } = req.body;
  const next = safeNext(req.query.next || req.body.next);

  const normalizedPhone = phone && phone.trim()
    ? phone.trim()
    : null;

  const birthday = date_of_birth && date_of_birth.trim()
    ? date_of_birth.trim()
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

    if (safeRole === 'customer' && birthday && !isValidBirthday(birthday)) {
      return res.render(registerView, {
        title: registerTitle,
        error: 'Please enter a valid birthday.'
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

    const newUser = {
      user_id: userId,
      full_name,
      email,
    };

    if (safeRole === 'customer') {
      await authModel.createCustomerProfile(
        userId,
        full_name,
        email,
        normalizedPhone,
        birthday
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

      if (!category || !category.trim()) {
        return res.render(registerView, {
          title: registerTitle,
          error: 'Please select your business category.'
        });
      }

      const merchantId = await authModel.createMerchantProfile(
        userId,
        merchant_name.trim(),
        email,
        normalizedPhone,
        address || '',
        business_uen,
        category.trim()
      );

      await qrService.ensureMerchantQRCodes(merchantId);
    }

    await sendVerificationEmail(req, newUser);

    if (safeRole === 'merchant') {
      return res.redirect('/auth/login?registered=1&verify=1');
    }

    res.redirect(`/auth/login?registered=1&verify=1${next ? '&next=' + encodeURIComponent(next) : ''}`);

  } catch (err) {
    console.error(err);

    res.render(registerView, {
      title: registerTitle,
      error: 'Registration failed. Please try again.'
    });
  }
}

function showForgotPassword(req, res) {
  if (req.session.user) return redirectDashboard(res, req.session.user);

  res.render('auth/forgotPassword', {
    title: 'Forgot Password',
    error: null,
    resetLink: null,
    resetEmailSent: false,
    submitted: false,
  });
}

async function verifyEmail(req, res) {
  try {
    const verified = await authModel.verifyEmailToken(req.params.token);

    if (!verified) {
      return res.render('auth/login', {
        title: 'Login',
        error: 'This verification link is invalid or expired.',
        query: req.query,
        verificationLink: null
      });
    }

    res.redirect('/auth/login?verified=1');
  } catch (err) {
    console.error(err);
    res.render('auth/login', {
      title: 'Login',
      error: 'Could not verify your email. Please try again.',
      query: req.query,
      verificationLink: null
    });
  }
}

async function requestPasswordReset(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();

  try {
    const user = email ? await authModel.findUserByEmail(email) : null;

    if (user) {
      const token = await authModel.createPasswordResetToken(user.user_id);
      return res.redirect(`/auth/reset-password/${token}`);
    }

    res.render('auth/forgotPassword', {
      title: 'Forgot Password',
      error: null,
      resetLink: null,
      resetEmailSent: false,
      submitted: true,
    });
  } catch (err) {
    console.error(err);
    res.render('auth/forgotPassword', {
      title: 'Forgot Password',
      error: 'Could not create a reset link. Please try again.',
      resetLink: null,
      resetEmailSent: false,
      submitted: false,
    });
  }
}

async function startPasswordResetFromLogin(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();

  try {
    const user = email ? await authModel.findUserByEmail(email) : null;

    if (!user) {
      return res.render('auth/login', {
        title: 'Login',
        error: 'Enter a registered email address to reset your password.',
        query: req.query,
        verificationLink: null
      });
    }

    const token = await authModel.createPasswordResetToken(user.user_id);
    res.redirect(`/auth/reset-password/${token}`);
  } catch (err) {
    console.error(err);
    res.render('auth/login', {
      title: 'Login',
      error: 'Could not start password reset. Please try again.',
      query: req.query,
      verificationLink: null
    });
  }
}

async function showResetPassword(req, res) {
  try {
    const resetToken = await authModel.getValidPasswordResetToken(req.params.token);

    if (!resetToken) {
      return res.render('auth/resetPassword', {
        title: 'Reset Password',
        token: null,
        error: 'This reset link is invalid or expired.',
        success: null,
      });
    }

    res.render('auth/resetPassword', {
      title: 'Reset Password',
      token: req.params.token,
      error: null,
      success: null,
    });
  } catch (err) {
    console.error(err);
    res.render('auth/resetPassword', {
      title: 'Reset Password',
      token: null,
      error: 'Could not load reset page.',
      success: null,
    });
  }
}

async function resetPassword(req, res) {
  const { password, confirm_password } = req.body;
  const token = req.params.token;

  try {
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    if (password !== confirm_password) {
      throw new Error('Passwords do not match.');
    }

    const hash = await bcrypt.hash(password, 10);
    await authModel.resetUserPassword(token, hash);

    res.render('auth/resetPassword', {
      title: 'Reset Password',
      token: null,
      error: null,
      success: 'Password updated. You can now sign in.',
    });
  } catch (err) {
    res.render('auth/resetPassword', {
      title: 'Reset Password',
      token,
      error: err.message || 'Could not reset password.',
      success: null,
    });
  }
}

function isValidBirthday(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const birthday = new Date(value + 'T00:00:00');
  if (Number.isNaN(birthday.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return birthday <= today;
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
  showForgotPassword,
  requestPasswordReset,
  startPasswordResetFromLogin,
  verifyEmail,
  showResetPassword,
  resetPassword,
  showMerchantPending,
  showMerchantRejected,
  login,
  register,
  logout
};
