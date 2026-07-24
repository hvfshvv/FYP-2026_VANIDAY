const bcrypt = require('bcryptjs');
const authModel = require('../models/authModel');
const merchantModel = require('../models/merchantModel');

function customerId(req) {
  return req.session.user.customer_id || req.session.user.user_id;
}

function redirectByRole(req, res) {
  const role = req.session.user?.role;
  if (role === 'merchant') return res.redirect('/merchant/dashboard');
  if (role === 'admin') return res.redirect('/admin/dashboard');
  return res.status(403).send('Customer account required.');
}

function sanitizeDateInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function normalizePhone(localNumber) {
  const digits = String(localNumber || '').replace(/[^\d]/g, '');

  if (!digits) return '';
  if (!/^[689]\d{7}$/.test(digits)) {
    const err = new Error('Please enter a valid Singapore phone number.');
    err.code = 'INVALID_SG_PHONE';
    throw err;
  }

  return `+65${digits}`;
}

async function showAccount(req, res) {
  if (req.session.user.role === 'merchant') {
    try {
      const merchant = await merchantModel.getMerchantAccountProfile(req.session.user.merchant_id);
      if (!merchant) return res.redirect('/merchant/dashboard');
      return res.render('merchant/account', {
        title: 'Merchant Profile',
        merchant,
        success: req.query.success || null,
        error: req.query.error || null,
      });
    } catch (err) {
      console.error('[account] showMerchantAccount error:', err);
      return res.status(500).redirect('/merchant/dashboard');
    }
  }
  if (req.session.user.role !== 'customer') return redirectByRole(req, res);

  const id = customerId(req);

  try {
    const accountUser = await authModel.getCustomerByUserId(id);

    if (!accountUser) {
      return res.redirect('/auth/login?next=/account');
    }

    res.render('customer/account', {
      title: res.locals.t('account.title'),
      accountUser,
      success: req.query.success || null,
      error: req.query.error || null,
    });
  } catch (err) {
    console.error('[account] showAccount error:', err);
    res.status(500).render('customer/account', {
      title: res.locals.t('account.title'),
      accountUser: req.session.user,
      success: null,
      error: res.locals.t('account.errors.loadFailed'),
    });
  }
}

async function updateMerchantProfile(req, res) {
  if (req.session.user.role !== 'merchant') return redirectByRole(req, res);

  try {
    const fullName = String(req.body.full_name || '').trim();
    const businessEmail = String(req.body.business_email || '').trim().toLowerCase();
    const address = String(req.body.address || '').trim();
    const description = String(req.body.description || '').trim();
    const ownerPhone = normalizePhone(req.body.owner_phone_local);
    const businessPhone = normalizePhone(req.body.business_phone_local);

    if (fullName.length < 2 || !businessEmail || !address) {
      return res.redirect('/account?error=' + encodeURIComponent('Please complete all required profile fields.'));
    }

    const updated = await merchantModel.updateMerchantAccountProfile(
      req.session.user.merchant_id,
      req.session.user.user_id,
      { fullName, ownerPhone, businessEmail, businessPhone, address, description }
    );

    req.session.user = {
      ...req.session.user,
      full_name: updated.full_name,
      phone: updated.owner_phone,
    };
    return res.redirect('/account?success=' + encodeURIComponent('Merchant profile updated.'));
  } catch (err) {
    console.error('[account] updateMerchantProfile error:', err);
    const message = err.code === 'INVALID_SG_PHONE'
      ? 'Please enter valid Singapore phone numbers.'
      : 'Could not update the merchant profile.';
    return res.redirect('/account?error=' + encodeURIComponent(message));
  }
}

async function updateProfile(req, res) {
  if (req.session.user.role !== 'customer') return redirectByRole(req, res);

  const fullName = String(req.body.full_name || '').trim();
  const phone = normalizePhone(req.body.phone_local || req.body.phone);
  const dateOfBirth = sanitizeDateInput(req.body.date_of_birth);

  if (fullName.length < 2) {
    return res.redirect('/account?error=' + encodeURIComponent(res.locals.t('account.errors.nameRequired')));
  }

  if (dateOfBirth && new Date(dateOfBirth) > new Date()) {
    return res.redirect('/account?error=' + encodeURIComponent(res.locals.t('account.errors.birthDateFuture')));
  }

  try {
    const updated = await authModel.updateUserProfile(req.session.user.user_id, {
      fullName,
      phone,
      dateOfBirth,
    });

    req.session.user = {
      ...req.session.user,
      full_name: updated.full_name,
      phone: updated.phone,
      date_of_birth: updated.date_of_birth,
    };

    res.redirect('/account?success=' + encodeURIComponent(res.locals.t('account.messages.profileSaved')));
  } catch (err) {
    console.error('[account] updateProfile error:', err);
    const message = err.code === 'INVALID_SG_PHONE'
      ? res.locals.t('account.errors.invalidSgPhone', null, 'Please enter a valid Singapore phone number.')
      : res.locals.t('account.errors.profileFailed');
    res.redirect('/account?error=' + encodeURIComponent(message));
  }
}

async function changePassword(req, res) {
  if (!['customer', 'merchant'].includes(req.session.user.role)) return redirectByRole(req, res);

  const currentPassword = String(req.body.current_password || '');
  const newPassword = String(req.body.new_password || '');
  const confirmPassword = String(req.body.confirm_password || '');

  if (newPassword.length < 6) {
    return res.redirect('/account?error=' + encodeURIComponent(res.locals.t('account.errors.passwordLength')));
  }

  if (newPassword !== confirmPassword) {
    return res.redirect('/account?error=' + encodeURIComponent(res.locals.t('account.errors.passwordMismatch')));
  }

  try {
    const user = await authModel.getUserById(req.session.user.user_id);
    if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
      return res.redirect('/account?error=' + encodeURIComponent(res.locals.t('account.errors.currentPassword')));
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await authModel.updateUserPassword(user.user_id, passwordHash);

    res.redirect('/account?success=' + encodeURIComponent(res.locals.t('account.messages.passwordSaved')));
  } catch (err) {
    console.error('[account] changePassword error:', err);
    res.redirect('/account?error=' + encodeURIComponent(res.locals.t('account.errors.passwordFailed')));
  }
}

async function checkCurrentPassword(req, res) {
  if (!['customer', 'merchant'].includes(req.session.user.role)) {
    return res.status(403).json({ valid: false });
  }

  const currentPassword = String(req.body.current_password || '');
  if (!currentPassword) return res.json({ valid: false });

  try {
    const user = await authModel.getUserById(req.session.user.user_id);
    const valid = Boolean(user && await bcrypt.compare(currentPassword, user.password_hash));
    res.json({ valid });
  } catch (err) {
    console.error('[account] checkCurrentPassword error:', err);
    res.status(500).json({ valid: false });
  }
}

module.exports = {
  showAccount,
  updateProfile,
  updateMerchantProfile,
  changePassword,
  checkCurrentPassword,
};
