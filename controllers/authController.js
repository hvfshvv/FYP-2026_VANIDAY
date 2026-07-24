const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const authModel = require('../models/authModel');
const loyaltyModel = require('../models/loyaltyModel');
const qrService = require('../services/qrService');
const emailService = require('../services/emailService');
const notificationModel = require('../models/notificationModel');

const ALLOWED_ROLES = ['customer', 'merchant'];
const HARDCODED_OTP_EMAILS = new Set([
  'glam@vaniday.com',
  'luxenail@uniday.com',
  'spa@uniday.com',
  'hairrepublic@uniday.com',
  'glow@uniday.com',
  'zen@uniday.com',
  'prettylash@uniday.com',
  'goddess@uniday.com',
  'johndoe@mail.com',
  'mary@gmail.com',
  'ka@gmail.com',
  'mary@mary.com',
  'crowncomb@uniday.com',
  'admin@uniday.com',
  'diane@diane.com',
  'may@may.com',
  'lilly@lilly.com',
  'dewyglow@uniday.com',
  'velvetbloom@uniday.com',
  'lushaura@uniday.com',
  'lunabeauty@uniday.com',
  'musehair@uniday.com',
  'whatsapp_6589483241@uniday.local',
  'aisyah@aisyah.com',
  'fathima123@gmail.com',
  'mimi@mimi.com',
  'minnie@uniday.com',
  '24048983@myrp.edu.sg',
  'sabrina@sabrina.com',
  'kk@gmail.com',
  'liza@liza.com',
  '24049021@myrp.edu.sg',
]);
const TEST_LOGIN_OTP = '000000';

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

function isEmailVerificationRequired() {
  const configured = String(process.env.EMAIL_VERIFICATION_REQUIRED || 'auto').toLowerCase();
  if (configured === 'false') return false;
  if (configured === 'true') return emailService.canDeliverEmail();
  return emailService.canDeliverEmail();
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

async function sendWelcomeEmail(req, user) {
  const token = await authModel.createEmailVerificationToken(user.user_id);
  const verificationUrl = `${getBaseUrl(req)}/auth/verify-email/${token}`;

  try {
    const result = await emailService.sendWelcomeEmail(user, verificationUrl);
    return {
      ...result,
      verificationUrl,
    };
  } catch (err) {
    console.error('welcome email send failed:', err);
    console.log(`Welcome verification link for ${user.email}: ${verificationUrl}`);
    return { sent: false, verificationUrl };
  }
}

function shouldEmailLoginOtp(user) {
  return !HARDCODED_OTP_EMAILS.has(String(user.email || '').trim().toLowerCase());
}

function generateLoginOtp(user) {
  if (!shouldEmailLoginOtp(user)) return TEST_LOGIN_OTP;
  return String(crypto.randomInt(100000, 1000000));
}

async function startLoginOtpChallenge(user, next) {
  const otp = generateLoginOtp(user);
  const emailRequired = shouldEmailLoginOtp(user);
  await authModel.createLogin2faToken(user.user_id, otp, next);

  if (!emailRequired) {
    return { sent: false, emailRequired, testOtp: TEST_LOGIN_OTP };
  }

  try {
    const result = await emailService.sendLoginOtpEmail(user, otp);
    return { ...result, emailRequired };
  } catch (err) {
    console.error('login OTP email send failed:', err);
    console.log(`Login OTP for ${user.email}: ${otp}`);
    return { sent: false, emailRequired };
  }
}

function renderLoginOtpPage(res, {
  email = '',
  next = null,
  otpEmailSent = false,
  emailRequired = false,
  resent = false,
  error = null,
} = {}) {
  res.render('auth/login2fa', {
    title: 'Enter Login OTP',
    email,
    next,
    otpEmailSent,
    emailRequired,
    testOtp: emailRequired ? null : TEST_LOGIN_OTP,
    resent,
    error,
  });
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
    await authModel.ensureCustomerProfile(
      user.user_id,
      user.full_name,
      user.email,
      user.phone || null
    );
    sessionUser.customer_id = user.user_id;
  }

  if (user.role === 'merchant') {
    const merchant = await authModel.getMerchantByUserId(user.user_id);
    sessionUser.merchant_id = merchant ? merchant.merchant_id : null;
    sessionUser.verification_status = merchant ? merchant.verification_status : 'pending';
    sessionUser.terms_accepted_at = merchant ? merchant.terms_accepted_at : null;
    sessionUser.terms_version = merchant ? merchant.terms_version : null;
  }

  return sessionUser;
}

function finishLogin(req, res, user, next) {
  req.session.user = user;

  const redirectAfterSave = () => {
    if (user.role === 'merchant') {
      if (user.verification_status === 'pending') return res.redirect('/auth/merchant-pending');
      if (user.verification_status === 'rejected') return res.redirect('/auth/merchant-rejected');
      if (!user.terms_accepted_at) return res.redirect('/auth/merchant-terms');
      return res.redirect('/merchant/dashboard');
    }

    if (user.role === 'admin') {
      return res.redirect('/admin/dashboard');
    }

    res.redirect(next || '/');
  };

  return req.session.save((err) => {
    if (err) {
      console.error('[auth] Failed to save login session:', err.message);
    }
    redirectAfterSave();
  });
}

function finishMerchantTermsAcceptance(req, res) {
  req.session.user.terms_accepted_at = new Date();
  req.session.user.terms_version = '2026-07';

  return req.session.save((err) => {
    if (err) {
      console.error('[auth] Failed to save merchant terms session:', err.message);
    }
    res.redirect('/merchant/dashboard');
  });
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
    verificationLink: null,
    email: ''
  });
}

function showLogin2fa(req, res) {
  if (req.session.user) return redirectDashboard(res, req.session.user);

  const pendingLogin = req.session.pendingLogin || null;
  if (!pendingLogin || !pendingLogin.user_id) return res.redirect('/auth/login');

  renderLoginOtpPage(res, {
    email: pendingLogin ? pendingLogin.email : '',
    next: pendingLogin ? pendingLogin.next : null,
    emailRequired: pendingLogin ? Boolean(pendingLogin.emailRequired) : false,
    resent: Boolean(req.query.resent),
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
  const password = req.body.login_password || req.body.password;
  const email = String(req.body.login_email || req.body.email || '').trim().toLowerCase();
  const next = safeNext(req.query.next || req.body.next);

  try {
    const user = await authModel.findUserByEmail(email);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.render('auth/login', {
        title: 'Login',
        error: 'Invalid email or password.',
        query: req.query,
        verificationLink: null,
        email
      });
    }

    if (user.status === 'suspended') {
      return res.render('auth/login', {
        title: 'Login',
        error: 'This account has been disabled. Please contact support.',
        query: req.query,
        verificationLink: null,
        email
      });
    }

    if (isEmailVerificationRequired() && !user.email_verified_at) {
      const verificationResult = await sendVerificationEmail(req, user);

      return res.render('auth/login', {
        title: 'Login',
        error: verificationResult.sent
          ? 'Please verify your email before signing in. A new verification link has been sent.'
          : 'Please verify your email before signing in. Email is not configured, so use the local verification link below.',
        query: req.query,
        verificationLink: verificationResult.sent ? null : verificationResult.verificationUrl,
        email
      });
    }

    const loginResult = await startLoginOtpChallenge(user, next);
    req.session.pendingLogin = {
      user_id: user.user_id,
      email: user.email,
      next,
      emailRequired: loginResult.emailRequired,
      createdAt: Date.now(),
    };

    renderLoginOtpPage(res, {
      email: user.email,
      next,
      otpEmailSent: Boolean(loginResult.sent),
      emailRequired: loginResult.emailRequired,
      resent: false,
      error: loginResult.emailRequired && !loginResult.sent
        ? 'Could not send your login code. Please try sending a new code.'
        : null,
    });

  } catch (err) {
    console.error(err);

    res.render('auth/login', {
      title: 'Login',
      error: 'Something went wrong. Please try again.',
      query: req.query,
      verificationLink: null,
      email
    });
  }
}

async function resendLogin2fa(req, res) {
  const pendingLogin = req.session.pendingLogin || null;

  if (!pendingLogin || !pendingLogin.user_id) {
    return res.redirect('/auth/login');
  }

  try {
    const user = await authModel.getUserById(pendingLogin.user_id);

    if (!user || user.status === 'suspended') {
      delete req.session.pendingLogin;
      return res.redirect('/auth/login');
    }

    const next = safeNext(pendingLogin.next);
    const loginResult = await startLoginOtpChallenge(user, next);
    req.session.pendingLogin = {
      user_id: user.user_id,
      email: user.email,
      next,
      emailRequired: loginResult.emailRequired,
      createdAt: Date.now(),
    };

    renderLoginOtpPage(res, {
      email: user.email,
      next,
      otpEmailSent: Boolean(loginResult.sent),
      emailRequired: loginResult.emailRequired,
      resent: true,
      error: loginResult.emailRequired && !loginResult.sent
        ? 'Could not send your login code. Please try sending a new code.'
        : null,
    });
  } catch (err) {
    console.error(err);
    renderLoginOtpPage(res, {
      email: pendingLogin.email || '',
      next: pendingLogin.next || null,
      emailRequired: Boolean(pendingLogin.emailRequired),
      resent: false,
      error: 'Could not send a new login code. Please try again.',
    });
  }
}

async function verifyLogin2fa(req, res) {
  const pendingLogin = req.session.pendingLogin || null;
  const otp = String(req.body.otp || '').replace(/\D/g, '');

  if (!pendingLogin || !pendingLogin.user_id) {
    return res.redirect('/auth/login');
  }

  if (!/^\d{6}$/.test(otp)) {
    return renderLoginOtpPage(res, {
      email: pendingLogin.email || '',
      next: pendingLogin.next || null,
      emailRequired: Boolean(pendingLogin.emailRequired),
      error: 'Enter the 6-digit login code.',
    });
  }

  try {
    const loginToken = await authModel.consumeLogin2faToken(pendingLogin.user_id, otp);

    if (!loginToken || loginToken.status === 'suspended') {
      return renderLoginOtpPage(res, {
        email: pendingLogin.email || '',
        next: pendingLogin.next || null,
        emailRequired: Boolean(pendingLogin.emailRequired),
        error: 'This login code is invalid or expired. Please try again.',
      });
    }

    delete req.session.pendingLogin;
    const sessionUser = await buildSessionUser(loginToken);
    finishLogin(req, res, sessionUser, safeNext(loginToken.next_path));
  } catch (err) {
    console.error(err);
    renderLoginOtpPage(res, {
      email: pendingLogin.email || '',
      next: pendingLogin.next || null,
      emailRequired: Boolean(pendingLogin.emailRequired),
      error: 'Could not verify your login code. Please try again.',
    });
  }
}

async function register(req, res) {
  const {
    full_name,
    phone,
    date_of_birth,
    role,
    merchant_name,
    business_email,
    business_phone,
    business_uen,
    address,
    category,
    merchant_terms_accepted
  } = req.body;
  const email = String(req.body.register_email || req.body.email || '').trim().toLowerCase();
  const password = req.body.register_password || req.body.password;
  const next = safeNext(req.query.next || req.body.next);

  const normalizedPhone = phone && phone.trim()
    ? phone.trim()
    : null;

  const normalizedBusinessEmail = String(business_email || '').trim().toLowerCase() || email;
  const normalizedBusinessPhone = business_phone && business_phone.trim()
    ? business_phone.trim()
    : normalizedPhone;

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

    if (normalizedPhone && !isValidSingaporePhone(normalizedPhone)) {
      return res.render(registerView, {
        title: registerTitle,
        error: 'Phone number must be exactly 8 digits.'
      });
    }

    if (business_phone && business_phone.trim() && !isValidSingaporePhone(business_phone)) {
      return res.render(registerView, {
        title: registerTitle,
        error: 'Business contact number must be exactly 8 digits.'
      });
    }

    if (safeRole === 'customer' && birthday && !isValidBirthday(birthday)) {
      return res.render(registerView, {
        title: registerTitle,
        error: 'Please enter a valid birthday.'
      });
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

      if (merchant_terms_accepted !== '1') {
        return res.render(registerView, {
          title: registerTitle,
          error: 'Please accept Uniday merchant terms, cancellation policy, and refund policy to continue.'
        });
      }
    }

    const hash = await bcrypt.hash(password, 10);
    let userId;
    let merchantId = null;

    if (safeRole === 'merchant') {
      const created = await authModel.createMerchantAccount({
        fullName: full_name,
        loginEmail: email,
        passwordHash: hash,
        ownerPhone: normalizedPhone,
        merchantName: merchant_name.trim(),
        businessEmail: normalizedBusinessEmail,
        businessPhone: normalizedBusinessPhone,
        address: address || '',
        businessUen: business_uen,
        category: category.trim(),
        termsVersion: '2026-07',
      });
      userId = created.userId;
      merchantId = created.merchantId;
    } else {
      userId = await authModel.createUser(
        full_name,
        email,
        hash,
        normalizedPhone,
        safeRole
      );
    }

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
      await loyaltyModel.createWalletForCustomer(userId);
    }

    if (safeRole === 'merchant') {
      await qrService.ensureMerchantQRCodes(merchantId);
    }

    await sendWelcomeEmail(req, newUser);
    await notificationModel.notifySignup(newUser).catch(err => {
      console.error('signup notification failed:', err);
    });

    const verifyQuery = isEmailVerificationRequired() ? '&verify=1' : '';

    if (safeRole === 'merchant') {
      return res.redirect(`/auth/login?registered=1${verifyQuery}`);
    }

    res.redirect(`/auth/login?registered=1${verifyQuery}${next ? '&next=' + encodeURIComponent(next) : ''}`);

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
        verificationLink: null,
        email: ''
      });
    }

    res.redirect('/auth/login?verified=1');
  } catch (err) {
    console.error(err);
    res.render('auth/login', {
      title: 'Login',
      error: 'Could not verify your email. Please try again.',
      query: req.query,
      verificationLink: null,
      email: ''
    });
  }
}

async function requestPasswordReset(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();

  try {
    const user = email ? await authModel.findUserByEmail(email) : null;
    let resetLink = null;
    let resetEmailSent = false;

    if (user) {
      const token = await authModel.createPasswordResetToken(user.user_id);
      resetLink = `${getBaseUrl(req)}/auth/reset-password/${token}`;

      try {
        const result = await emailService.sendPasswordResetEmail(user, resetLink);
        resetEmailSent = Boolean(result.sent);
      } catch (err) {
        console.error('password reset email send failed:', err);
        console.log(`Password reset link for ${user.email}: ${resetLink}`);
      }
    }

    res.render('auth/forgotPassword', {
      title: 'Forgot Password',
      error: null,
      resetLink: resetEmailSent ? null : resetLink,
      resetEmailSent,
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
  const email = String(req.body.login_email || req.body.email || '').trim().toLowerCase();

  try {
    const user = email ? await authModel.findUserByEmail(email) : null;

    if (!user) {
      return res.render('auth/login', {
        title: 'Login',
        error: 'Enter a registered email address to reset your password.',
        query: req.query,
        verificationLink: null,
        email
      });
    }

    const token = await authModel.createPasswordResetToken(user.user_id);
    const resetLink = `${getBaseUrl(req)}/auth/reset-password/${token}`;

    try {
      const result = await emailService.sendPasswordResetEmail(user, resetLink);

      if (result.sent) {
        return res.render('auth/login', {
          title: 'Login',
          error: null,
          query: req.query,
          verificationLink: null,
          email,
          resetEmailSent: true,
          resetLink: null
        });
      }
    } catch (err) {
      console.error('password reset email send failed:', err);
      console.log(`Password reset link for ${user.email}: ${resetLink}`);
    }

    res.render('auth/login', {
      title: 'Login',
      error: null,
      query: req.query,
      verificationLink: null,
      email,
      resetEmailSent: false,
      resetLink
    });
  } catch (err) {
    console.error(err);
    res.render('auth/login', {
      title: 'Login',
      error: 'Could not start password reset. Please try again.',
      query: req.query,
      verificationLink: null,
      email
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

function isValidSingaporePhone(value) {
  return /^\d{8}$/.test(String(value || '').trim());
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

function showMerchantTermsAcceptance(req, res) {
  if (!req.session.user || req.session.user.role !== 'merchant') {
    return res.redirect('/auth/login?next=/auth/merchant-terms');
  }

  if (req.session.user.verification_status === 'pending') {
    return res.redirect('/auth/merchant-pending');
  }

  if (req.session.user.verification_status === 'rejected') {
    return res.redirect('/auth/merchant-rejected');
  }

  res.render('auth/merchantTermsAccept', {
    title: 'Accept Merchant Terms',
    error: null,
  });
}

async function acceptMerchantTerms(req, res) {
  try {
    if (!req.session.user || req.session.user.role !== 'merchant') {
      return res.redirect('/auth/login?next=/auth/merchant-terms');
    }

    if (req.body.merchant_terms_accepted !== '1') {
      return res.status(400).render('auth/merchantTermsAccept', {
        title: 'Accept Merchant Terms',
        error: 'Please accept Uniday merchant terms, cancellation policy, and refund policy to continue.',
      });
    }

    await authModel.acceptMerchantTerms(req.session.user.user_id, '2026-07');
    finishMerchantTermsAcceptance(req, res);
  } catch (err) {
    console.error(err);
    res.status(500).render('auth/merchantTermsAccept', {
      title: 'Accept Merchant Terms',
      error: 'Could not record merchant terms acceptance. Please try again.',
    });
  }
}

module.exports = {
  showLogin,
  showLogin2fa,
  showStartpage,
  showRegister,
  showMerchantRegister,
  showForgotPassword,
  requestPasswordReset,
  startPasswordResetFromLogin,
  resendLogin2fa,
  verifyLogin2fa,
  verifyEmail,
  showResetPassword,
  resetPassword,
  showMerchantPending,
  showMerchantRejected,
  showMerchantTermsAcceptance,
  acceptMerchantTerms,
  login,
  register,
  logout
};
