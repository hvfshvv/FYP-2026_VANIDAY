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

const bookingModel = require('../models/bookingModel');
const revenueModel = require('../models/revenueModel');
const merchantModel = require('../models/merchantModel');

// Every route in this file requires a logged-in, approved merchant account.
router.use(requireLogin, requireMerchant);

// Dashboard: shows recent bookings, revenue summary and marketplace photo settings.
router.get('/dashboard', async (req, res) => {
  const merchantId = req.session.user.merchant_id;

  const [bookings, summary, merchant] = await Promise.all([
    bookingModel.getMerchantBookings(merchantId).catch(() => []),
    revenueModel.getMerchantRevenueSummary(merchantId).catch(() => ({})),
    merchantModel.getMerchantProfile(merchantId).catch(() => null),
  ]);

  res.render('merchant/dashboard', {
    title: 'Merchant Dashboard',
    bookings,
    summary,
    merchant,
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

// Revenue report with summary, transactions and monthly chart data.
router.get('/revenue', async (req, res) => {
  const merchantId = req.session.user.merchant_id;

  const [summary, transactions, monthly] = await Promise.all([
    revenueModel.getMerchantRevenueSummary(merchantId).catch(() => ({})),
    revenueModel.getMerchantTransactions(merchantId).catch(() => []),
    revenueModel.getMonthlyRevenue(merchantId).catch(() => []),
  ]);

  res.render('merchant/revenue', {
    title: 'Revenue Report',
    summary,
    transactions,
    monthly
  });
});

// Booking status updates are scoped by merchantId so merchants can only update their own bookings.
router.post('/bookings/:bookingId/arrived', async (req, res) => {
  const merchantId = req.session.user.merchant_id;
  const returnTo = req.body.returnTo === '/merchant/bookings' ? '/merchant/bookings' : '/merchant/dashboard';

  await bookingModel
    .updateMerchantBookingStatus(req.params.bookingId, merchantId, 'arrived')
    .catch(console.error);

  res.redirect(returnTo);
});

// Mark an arrived booking as completed.
router.post('/bookings/:bookingId/complete', async (req, res) => {
  const merchantId = req.session.user.merchant_id;
  const returnTo = req.body.returnTo === '/merchant/bookings' ? '/merchant/bookings' : '/merchant/dashboard';

  await bookingModel
    .updateMerchantBookingStatus(req.params.bookingId, merchantId, 'completed')
    .catch(console.error);

  res.redirect(returnTo);
});

// QR Code pages and actions.
router.get('/qr', qrCtrl.showQRPage);
router.post('/qr/generate', qrCtrl.generateQRCode);
router.post('/qr/regenerate', qrCtrl.regenerateQRCode);
router.post('/qr/arrival/regenerate', qrCtrl.regenerateArrivalQRCode);

// Promotion management for merchant-created deals.
router.get('/promotions', promoCtrl.showPromotions);
router.post('/promotions/create', promoCtrl.handlePromotionUpload, promoCtrl.createPromotion);
router.post('/promotions/:promoId/toggle', promoCtrl.togglePromotion);
router.post('/promotions/:promoId/delete', promoCtrl.deletePromotion);

// Customer reviews for this merchant.
router.get('/reviews', reviewCtrl.showMerchantReviews);
router.post('/reviews/:reviewId/reply', reviewCtrl.replyToReview);

// Service management: add, hide/show, and delete bookable services.
router.get('/services', svcCtrl.showServices);
router.post('/services/add', svcCtrl.addService);
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
