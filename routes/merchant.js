const express  = require('express');
const router   = express.Router();

const { requireLogin, requireMerchant } = require('../middleware/auth');

const qrCtrl    = require('../controllers/qrController');
const promoCtrl = require('../controllers/promotionController');
const svcCtrl   = require('../controllers/serviceController');
const merchantProfileCtrl = require('../controllers/merchantProfileController');

const staffCtrl = require('../controllers/staffController');
const availabilityCtrl = require('../controllers/availabilityController');
const reviewCtrl = require('../controllers/reviewController');
const cancellationPolicyCtrl = require('../controllers/cancellationPolicyController');

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

// Every route in this file requires a logged-in, approved merchant account.
router.use(requireLogin, requireMerchant);

// Dashboard: decision-support indicators, today's schedule, and action warnings.
router.get('/dashboard', async (req, res) => {
  const merchantId = req.session.user.merchant_id;
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
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
  ] = await Promise.all([
    bookingModel.getMerchantDashboardSummary(merchantId, periodStart).catch(() => ({})),
    isCurrentPeriod ? bookingModel.getMerchantTodaySchedule(merchantId).catch(() => []) : [],
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

// All merchant bookings for this merchant account.
router.get('/bookings', async (req, res) => {
  const merchantId = req.session.user.merchant_id;
  const bookings = await bookingModel.getMerchantBookings(merchantId).catch(() => []);

  res.render('merchant/bookings', {
    title: 'Merchant Bookings',
    bookings,
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

router.post('/waitlists/:waitlistId/remove', async (req, res) => {
  const merchantId = req.session.user.merchant_id;

  try {
    await waitlistModel.removeMerchantWaitlist(req.params.waitlistId, merchantId);
    res.redirect('/merchant/waitlists?success=' + encodeURIComponent('Waitlist request removed.'));
  } catch (err) {
    console.error(err);
    res.redirect('/merchant/waitlists?error=' + encodeURIComponent(err.message || 'Could not remove waitlist request.'));
  }
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

  res.render('merchant/revenue', {
    title: 'Revenue Report',
    summary,
    transactions,
    monthly,
    selectedPeriod,
    currentPeriod,
    periodLabel,
    payoutOverview,
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

// QR Code pages and actions.
router.get('/qr', qrCtrl.showQRPage);

// Promotion management for merchant-created deals.
router.get('/promotions', promoCtrl.showPromotions);
router.post('/promotions/create', promoCtrl.handlePromotionUpload, promoCtrl.createPromotion);
router.post('/promotions/:promoId/toggle', promoCtrl.togglePromotion);
router.post('/promotions/:promoId/delete', promoCtrl.deletePromotion);

// Customer reviews for this merchant.
router.get('/reviews', reviewCtrl.showMerchantReviews);
router.post('/reviews/:reviewId/reply', reviewCtrl.replyToReview);

// Merchant cancellation policy.
router.get('/cancellation-policy', cancellationPolicyCtrl.showPolicy);
router.post('/cancellation-policy', cancellationPolicyCtrl.updatePolicy);

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
