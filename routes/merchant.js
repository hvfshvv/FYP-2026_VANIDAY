const express  = require('express');
const router   = express.Router();

const { requireLogin, requireMerchant } = require('../middleware/auth');

const qrCtrl    = require('../controllers/qrController');
const promoCtrl = require('../controllers/promotionController');
const svcCtrl   = require('../controllers/serviceController');
const merchantProfileCtrl = require('../controllers/merchantProfileController');
const merchantInsightsCtrl = require('../controllers/merchantInsightsController');

const staffCtrl = require('../controllers/staffController');
const availabilityCtrl = require('../controllers/availabilityController');
const reviewCtrl = require('../controllers/reviewController');
const cancellationPolicyCtrl = require('../controllers/cancellationPolicyController');
const disruptionCtrl = require('../controllers/bookingDisruptionController');
const disruptionModel = require('../models/bookingDisruptionModel');

const bookingModel = require('../models/bookingModel');
const revenueModel = require('../models/revenueModel');
const payoutModel = require('../models/payoutModel');
const merchantModel = require('../models/merchantModel');
const serviceModel = require('../models/serviceModel');
const staffModel = require('../models/staffModel');
const availabilityModel = require('../models/availabilityModel');
const reviewModel = require('../models/reviewModel');
const promotionModel = require('../models/promotionModel');
const loyaltyModel = require('../models/loyaltyModel');
const waitlistModel = require('../models/waitlistModel');
const stripeService = require('../services/stripeService');

// Every route in this file requires a logged-in, approved merchant account.
router.use(requireLogin, requireMerchant);

// Merchant-only analytics. The merchant id always comes from the verified session.
router.get('/insights', merchantInsightsCtrl.showInsights);
router.post('/insights/ai-plan', merchantInsightsCtrl.generateActionPlan);

// Dashboard: decision-support indicators, today's schedule, and action warnings.
router.get('/dashboard', async (req, res) => {
  const merchantId = req.session.user.merchant_id;
  const now = new Date();
  const singaporeDateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now).reduce((parts, part) => {
    if (part.type !== 'literal') parts[part.type] = part.value;
    return parts;
  }, {});
  const currentPeriod = `${singaporeDateParts.year}-${singaporeDateParts.month}`;
  const todayLabel = new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);
  const requestedPeriod = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.month || ''))
    ? String(req.query.month)
    : currentPeriod;
  const selectedPeriod = requestedPeriod <= currentPeriod ? requestedPeriod : currentPeriod;
  const periodStart = `${selectedPeriod}-01`;
  const isCurrentPeriod = selectedPeriod === currentPeriod;
  const periodLabel = new Date(`${periodStart}T00:00:00`).toLocaleDateString('en-SG', {
    month: 'long',
    year: 'numeric',
  });

  const [
    bookingSummary,
    todaySchedule,
    revenueSummary,
    monthlyRevenue,
    topRevenueService,
    topPerformingStaff,
    services,
    staff,
    availability,
    reviewSummary,
    promotions,
    activeWaitlistCount,
    merchant,
  ] = await Promise.all([
    bookingModel.getMerchantDashboardSummary(merchantId, periodStart).catch(() => ({})),
    bookingModel.getMerchantTodaySchedule(merchantId).catch(() => []),
    revenueModel.getMerchantRevenueSummary(merchantId, selectedPeriod).catch(() => ({})),
    revenueModel.getMonthlyRevenue(merchantId).catch(() => []),
    revenueModel.getTopRevenueService(merchantId, selectedPeriod).catch(() => null),
    revenueModel.getTopPerformingStaffThisMonth(merchantId, periodStart).catch(() => null),
    serviceModel.getServicesByMerchant(merchantId).catch(() => []),
    staffModel.getStaffByMerchant(merchantId).catch(() => []),
    availabilityModel.getAvailabilityByMerchant(merchantId).catch(() => []),
    reviewModel.getMerchantReviewSummary(merchantId, periodStart).catch(() => ({})),
    promotionModel.getMerchantPromotions(merchantId).catch(() => []),
    waitlistModel.getMerchantActiveWaitlistCount(merchantId).catch(() => 0),
    merchantModel.getMerchantProfile(merchantId).catch(() => null),
  ]);

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const configuredDays = new Set(availability.map(item => item.day_of_week));
  const missingAvailabilityDays = days.filter(day => !configuredDays.has(day));
  const operations = {
    activeServices: services.filter(item => Number(item.is_active) === 1).length,
    inactiveServices: services.filter(item => Number(item.is_active) !== 1).length,
    activeStaff: staff.filter(item => Number(item.is_active) === 1).length,
    inactiveStaff: staff.filter(item => Number(item.is_active) !== 1).length,
    activeAvailabilityDays: availability.filter(item => Number(item.is_active) === 1).length,
    missingAvailabilityDays,
    pendingPromotions: promotions.filter(item => item.approval_status === 'pending').length,
  };

  const monthlyFinishedBookings =
    Number(bookingSummary.month_completed || 0) +
    Number(bookingSummary.month_cancelled || 0) +
    Number(bookingSummary.month_no_show || 0);
  const cancellationRate = monthlyFinishedBookings
    ? Math.round((Number(bookingSummary.month_cancelled || 0) / monthlyFinishedBookings) * 100)
    : 0;
  const previousMonthRevenue = Number(revenueSummary.previous_month_revenue || 0);
  const currentMonthRevenue = Number(revenueSummary.month_revenue || 0);
  const revenueGrowth = previousMonthRevenue > 0
    ? Math.round(((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100)
    : null;
  const dashboardMetrics = {
    cancellationRate,
    monthlyFinishedBookings,
    monthlyCancelledBookings: Number(bookingSummary.month_cancelled || 0),
    revenueGrowth,
  };

  const pendingActions = [
    Number(reviewSummary.awaiting_reply || 0) > 0 && {
      icon: 'bi-chat-left-text',
      label: `${reviewSummary.awaiting_reply} review(s) awaiting reply`,
      href: '/merchant/reviews',
    },
    operations.pendingPromotions > 0 && {
      icon: 'bi-hourglass-split',
      label: `${operations.pendingPromotions} promotion(s) awaiting approval`,
      href: '/merchant/promotions',
    },
    missingAvailabilityDays.length > 0 && {
      icon: 'bi-calendar-x',
      label: `Availability not configured for ${missingAvailabilityDays.join(', ')}`,
      href: '/merchant/availability',
    },
    operations.activeAvailabilityDays === 0 && {
      icon: 'bi-clock-history',
      label: 'No operating availability is currently active',
      href: '/merchant/availability',
    },
    operations.activeStaff === 0 && {
      icon: 'bi-people',
      label: 'No active staff available for bookings',
      href: '/merchant/staff',
    },
    operations.activeServices === 0 && {
      icon: 'bi-scissors',
      label: 'No active services listed',
      href: '/merchant/services',
    },
    Number(activeWaitlistCount || 0) > 0 && {
      icon: 'bi-list-ol',
      label: `${activeWaitlistCount} active waitlist request(s)`,
      href: '/merchant/waitlists',
    },
  ].filter(Boolean);

  res.render('merchant/dashboard', {
    title: 'Merchant Dashboard',
    bookingSummary,
    todaySchedule,
    revenueSummary,
    monthlyRevenue: monthlyRevenue.reverse(),
    topRevenueService,
    topPerformingStaff,
    reviewSummary,
    operations,
    dashboardMetrics,
    pendingActions,
    activeWaitlistCount,
    merchant,
    todayLabel,
    selectedPeriod,
    currentPeriod,
    periodLabel,
    isCurrentPeriod,
  });
});

// Management hub preserves all merchant setup and control functions.
router.get('/manage', async (req, res) => {
  const merchantId = req.session.user.merchant_id;
  const [merchant, activeWaitlistCount] = await Promise.all([
    merchantModel.getMerchantProfile(merchantId).catch(() => null),
    waitlistModel.getMerchantActiveWaitlistCount(merchantId).catch(() => 0),
  ]);

  res.render('merchant/manage', {
    title: 'Merchant Management',
    merchant,
    activeWaitlistCount,
    imageSuccess: req.query.imageSuccess,
    imageError: req.query.imageError,
  });
});

// Updates the image used for the merchant card on the marketplace.
router.post(
  '/marketplace-image',
  merchantProfileCtrl.handleMarketplaceImageUpload,
  merchantProfileCtrl.updateMarketplaceImage
);

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function appBaseUrl(req) {
  const configured = normalizeBaseUrl(process.env.APP_URL || process.env.APP_BASE_URL || process.env.VERCEL_URL);
  if (configured) return configured;

  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const proto = forwardedProto || req.protocol || 'http';
  return normalizeBaseUrl(`${proto}://${req.get('host')}`);
}

function connectErrorMessage(err) {
  const fallback = 'Could not start Stripe Connect onboarding. Check Stripe keys and try again.';
  if (process.env.NODE_ENV === 'production') return fallback;

  const detail = String(err?.message || '').trim();
  return detail ? `${fallback} Stripe error: ${detail}` : fallback;
}

function isMissingStripeAccountError(err) {
  const message = String(err?.message || '').toLowerCase();
  return err?.code === 'resource_missing'
    || message.includes('no such account')
    || message.includes('does not have access to account');
}

async function createAndSaveStripeAccount(merchantId, merchant) {
  const account = await stripeService.createExpressConnectedAccount({
    email: merchant.email,
    businessName: merchant.merchant_name,
    productDescription: merchant.description,
  });

  await merchantModel.saveMerchantStripeAccountId(merchantId, account.id);
  await merchantModel.updateMerchantStripeAccountStatus(merchantId, account);

  return account.id;
}

async function createStripeConnectLink(req, res) {
  const merchantId = req.session.user.merchant_id;

  try {
    let merchant = await merchantModel.getMerchantStripeAccount(merchantId);
    if (!merchant) {
      throw new Error('Merchant account was not found.');
    }

    let accountId = merchant?.stripe_account_id;

    if (!accountId) {
      accountId = await createAndSaveStripeAccount(merchantId, merchant);
      merchant = { ...merchant, stripe_account_id: accountId };
    }

    const baseUrl = appBaseUrl(req);
    const linkOptions = {
      refreshUrl: `${baseUrl}/merchant/stripe/refresh`,
      returnUrl: `${baseUrl}/merchant/stripe/return`,
    };
    let link;

    try {
      link = await stripeService.createConnectAccountLink({
        accountId,
        ...linkOptions,
      });
    } catch (err) {
      if (!isMissingStripeAccountError(err)) throw err;

      console.warn('[stripe connect] saved account unavailable; creating a new connected account', {
        merchantId,
        accountId,
        code: err?.code,
        message: err?.message,
      });

      accountId = await createAndSaveStripeAccount(merchantId, merchant);
      link = await stripeService.createConnectAccountLink({
        accountId,
        ...linkOptions,
      });
    }

    if (!link?.url) {
      throw new Error('Stripe did not return an onboarding link.');
    }

    res.redirect(link.url);
  } catch (err) {
    console.error('[stripe connect] onboarding error:', {
      type: err?.type,
      code: err?.code,
      statusCode: err?.statusCode,
      message: err?.message,
      requestId: err?.requestId,
    });
    res.redirect('/merchant/revenue?error=' + encodeURIComponent(connectErrorMessage(err)));
  }
}

router.post('/stripe/connect', createStripeConnectLink);
router.get('/stripe/refresh', createStripeConnectLink);

router.get('/stripe/return', async (req, res) => {
  const merchantId = req.session.user.merchant_id;

  try {
    const merchant = await merchantModel.getMerchantStripeAccount(merchantId);
    if (merchant?.stripe_account_id) {
      const account = await stripeService.retrieveConnectedAccount(merchant.stripe_account_id);
      await merchantModel.updateMerchantStripeAccountStatus(merchantId, account);
    }
    res.redirect('/merchant/revenue?success=' + encodeURIComponent('Stripe payout account updated.'));
  } catch (err) {
    console.error('[stripe connect] return error:', err);
    res.redirect('/merchant/revenue?error=' + encodeURIComponent('Could not refresh Stripe payout account status.'));
  }
});

// All merchant bookings for this merchant account.
router.get('/bookings', async (req, res) => {
  const merchantId = req.session.user.merchant_id;
  const bookings = await bookingModel.getMerchantBookings(merchantId).catch(() => []);
  const replacementEntries = await Promise.all(bookings.map(async booking => [
    booking.booking_id,
    ['confirmed', 'rescheduled'].includes(booking.status)
      ? await disruptionModel.getReplacementStaff(booking.booking_id, merchantId).catch(() => [])
      : [],
  ]));
  const replacementStaff = Object.fromEntries(replacementEntries);
  const closures = await disruptionModel.listClosures(merchantId).catch(() => []);

  res.render('merchant/bookings', {
    title: 'Merchant Bookings',
    bookings,
    replacementStaff,
    closures,
    success: req.query.success,
    error: req.query.error,
  });
});

// Waitlist overview for fully booked slots.
router.get('/waitlists', async (req, res) => {
  const merchantId = req.session.user.merchant_id;
  const waitlists = await waitlistModel.getMerchantWaitlists(merchantId).catch(() => []);

  res.render('merchant/waitlists', {
    title: 'Waitlists',
    waitlists,
    success: req.query.success,
    error: req.query.error,
  });
});

// Revenue report with summary, transactions and monthly chart data.
router.get('/revenue', async (req, res) => {
  const merchantId = req.session.user.merchant_id;
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const requestedPeriod = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.month || ''))
    ? String(req.query.month)
    : currentPeriod;
  const selectedPeriod = requestedPeriod <= currentPeriod ? requestedPeriod : currentPeriod;
  const periodLabel = new Date(`${selectedPeriod}-01T00:00:00`).toLocaleDateString('en-SG', {
    month: 'long',
    year: 'numeric',
  });
  const currentMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  currentMonday.setDate(currentMonday.getDate() - ((currentMonday.getDay() + 6) % 7));
  const nextMonday = new Date(currentMonday);
  nextMonday.setDate(nextMonday.getDate() + 7);
  const payoutCutoffLabel = currentMonday.toLocaleDateString('en-SG', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const nextPayoutLabel = nextMonday.toLocaleDateString('en-SG', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const [summary, transactions, monthly] = await Promise.all([
    revenueModel.getMerchantRevenueSummary(merchantId, selectedPeriod).catch(() => ({})),
    revenueModel.getMerchantTransactions(merchantId, selectedPeriod).catch(() => []),
    revenueModel.getMonthlyRevenue(merchantId).catch(() => []),
    payoutModel.ensurePayoutSchema().catch(() => null),
  ]);
  const payoutOverview = await payoutModel.getMerchantPayoutOverview(merchantId).catch(() => ({
    eligibleBookings: [],
    eligibleGross: 0,
    eligibleCommission: 0,
    eligibleAmount: 0,
    payouts: [],
  }));
  const payoutRunLabel = Number(payoutOverview.eligibleAmount || 0) > 0
    ? payoutCutoffLabel
    : nextPayoutLabel;

  res.render('merchant/revenue', {
    title: 'Revenue Summary',
    summary,
    transactions,
    monthly,
    selectedPeriod,
    currentPeriod,
    periodLabel,
    payoutCutoffLabel,
    nextPayoutLabel,
    payoutRunLabel,
    payoutOverview,
    success: req.query.success || null,
    error: req.query.error || null,
  });
});

// Booking status updates are scoped by merchantId so merchants can only update their own bookings.
router.post('/bookings/:bookingId/arrived', async (req, res) => {
  const merchantId = req.session.user.merchant_id;
  const returnTo = req.body.returnTo === '/merchant/bookings' ? '/merchant/bookings' : '/merchant/dashboard';

  const updated = await bookingModel
    .updateMerchantBookingStatus(req.params.bookingId, merchantId, 'arrived')
    .catch(() => 0);

  const query = updated
    ? `?success=${encodeURIComponent('Customer marked as arrived.')}`
    : `?error=${encodeURIComponent('Arrival can only be marked from 15 minutes before the appointment time.')}`;
  res.redirect(`${returnTo}${query}`);
});

// Mark an arrived booking as completed.
router.post('/bookings/:bookingId/complete', async (req, res) => {
  const merchantId = req.session.user.merchant_id;
  const returnTo = req.body.returnTo === '/merchant/bookings' ? '/merchant/bookings' : '/merchant/dashboard';

  const updated = await bookingModel
    .updateMerchantBookingStatus(req.params.bookingId, merchantId, 'completed')
    .catch(() => 0);

  if (updated) {
    await loyaltyModel.awardBookingPoints(req.params.bookingId).catch(err => {
      console.error('Could not award completion points:', err);
    });
  }

  const query = updated
    ? `?success=${encodeURIComponent('Booking marked as completed.')}`
    : `?error=${encodeURIComponent('Only arrived bookings can be completed after the appointment end time.')}`;
  res.redirect(`${returnTo}${query}`);
});

// Mark a past confirmed appointment as a no-show.
router.post('/bookings/:bookingId/no-show', async (req, res) => {
  const merchantId = req.session.user.merchant_id;
  const updated = await bookingModel
    .updateMerchantBookingStatus(req.params.bookingId, merchantId, 'no_show')
    .catch(() => 0);

  const query = updated
    ? `?success=${encodeURIComponent('Booking marked as no-show.')}`
    : `?error=${encodeURIComponent('Only past confirmed appointments can be marked as no-show.')}`;
  res.redirect(`/merchant/bookings${query}`);
});

router.post('/bookings/:bookingId/cancel-other', disruptionCtrl.cancelOther);
router.post('/bookings/:bookingId/propose-replacement', disruptionCtrl.proposeReplacement);
router.post('/emergency-closures', disruptionCtrl.emergencyClosure);

// QR Code pages and actions.
router.get('/qr', qrCtrl.showQRPage);

// Promotion management for merchant-created deals.
router.get('/promotions', promoCtrl.showPromotions);
router.post('/promotions/ai-suggestion', promoCtrl.generateAiPromotion);
router.post('/promotions/create', promoCtrl.handlePromotionUpload, promoCtrl.createPromotion);
router.post('/promotions/:promoId/toggle', promoCtrl.togglePromotion);
router.post('/promotions/:promoId/delete', promoCtrl.deletePromotion);

// Customer reviews for this merchant.
router.get('/reviews', reviewCtrl.showMerchantReviews);
router.post('/reviews/:reviewId/reply', reviewCtrl.replyToReview);

// Merchant cancellation policy.
router.get('/cancellation-policy', cancellationPolicyCtrl.showPolicy);

// Service management: add, hide/show, and delete bookable services.
router.get('/services', svcCtrl.showServices);
router.post('/services/add', svcCtrl.addService);
router.post('/services/:id/edit', svcCtrl.editService);
router.post('/services/:id/toggle', svcCtrl.toggleService);
router.post('/services/:id/delete', svcCtrl.deleteService);

// Staff management.
router.get('/staff', staffCtrl.showStaff);
router.post('/staff/add', staffCtrl.addStaff);
router.post('/staff/:id/edit', staffCtrl.editStaff);
router.post('/staff/:id/toggle', staffCtrl.toggleStaff);
router.post('/staff/:id/delete', staffCtrl.deleteStaff);

// Merchant availability and working hours.
router.get('/availability', availabilityCtrl.showAvailability);
router.post('/availability/save', availabilityCtrl.saveAvailability);
router.post('/availability/:id/delete', availabilityCtrl.deleteAvailability);

module.exports = router;
