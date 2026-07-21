const bcrypt = require('bcryptjs');
const authModel = require('../models/authModel');
const bookingModel = require('../models/bookingModel');
const favouriteModel = require('../models/favouriteModel');
const loyaltyModel = require('../models/loyaltyModel');
const walletModel = require('../models/walletModel');

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

function buildBookingStats(bookings) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return bookings.reduce((stats, booking) => {
    const status = String(booking.status || '').toLowerCase();
    const bookingDate = booking.booking_date ? new Date(booking.booking_date) : null;
    const isUpcoming = bookingDate && bookingDate >= today && !['completed', 'cancelled', 'payment_failed'].includes(status);

    if (isUpcoming) stats.upcoming += 1;
    if (status === 'completed') stats.completed += 1;
    if (status === 'pending_payment') stats.pendingPayment += 1;

    stats.total += 1;
    return stats;
  }, {
    total: 0,
    upcoming: 0,
    completed: 0,
    pendingPayment: 0,
  });
}

async function showAccount(req, res) {
  if (req.session.user.role !== 'customer') return redirectByRole(req, res);

  const id = customerId(req);

  try {
    const [
      accountUser,
      bookings,
      favouriteMerchants,
      favouriteServices,
      loyaltySummary,
      paymentWallet,
    ] = await Promise.all([
      authModel.getCustomerByUserId(id),
      bookingModel.getCustomerBookings(id).catch(() => []),
      favouriteModel.getFavouriteMerchants(id).catch(() => []),
      favouriteModel.getFavouriteServices(id).catch(() => []),
      loyaltyModel.getWalletSummary(id).catch(() => ({
        wallet: { points_balance: 0, lifetime_points_earned: 0, lifetime_points_redeemed: 0 },
        tier: { name: 'Bronze' },
      })),
      walletModel.getWalletSummary(id).catch(() => ({
        wallet: { balance: 0, money_balance: 0 },
        transactions: [],
      })),
    ]);

    if (!accountUser) {
      return res.redirect('/auth/login?next=/account');
    }

    res.render('customer/account', {
      title: res.locals.t('account.title'),
      accountUser,
      bookingStats: buildBookingStats(bookings),
      favouriteCount: favouriteMerchants.length + favouriteServices.length,
      loyaltyWallet: loyaltySummary.wallet,
      loyaltyTier: loyaltySummary.tier,
      paymentWallet: paymentWallet.wallet,
      success: req.query.success || null,
      error: req.query.error || null,
    });
  } catch (err) {
    console.error('[account] showAccount error:', err);
    res.status(500).render('customer/account', {
      title: res.locals.t('account.title'),
      accountUser: req.session.user,
      bookingStats: buildBookingStats([]),
      favouriteCount: 0,
      loyaltyWallet: { points_balance: 0, lifetime_points_earned: 0, lifetime_points_redeemed: 0 },
      loyaltyTier: { name: 'Bronze' },
      paymentWallet: { balance: 0, money_balance: 0 },
      success: null,
      error: res.locals.t('account.errors.loadFailed'),
    });
  }
}

async function updateProfile(req, res) {
  if (req.session.user.role !== 'customer') return redirectByRole(req, res);

  const fullName = String(req.body.full_name || '').trim();
  const phone = String(req.body.phone || '').trim();
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
    res.redirect('/account?error=' + encodeURIComponent(res.locals.t('account.errors.profileFailed')));
  }
}

async function changePassword(req, res) {
  if (req.session.user.role !== 'customer') return redirectByRole(req, res);

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

module.exports = {
  showAccount,
  updateProfile,
  changePassword,
};
