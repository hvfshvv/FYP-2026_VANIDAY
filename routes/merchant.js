const express  = require('express');
const router   = express.Router();
const { requireLogin, requireMerchant } = require('../middleware/auth');
const qrCtrl      = require('../controllers/qrController');
const promoCtrl   = require('../controllers/promotionController');
const featCtrl    = require('../controllers/featuredController');
const svcCtrl     = require('../controllers/serviceController');
const bookingModel = require('../models/bookingModel');
const revenueModel = require('../models/revenueModel');

router.use(requireLogin, requireMerchant);

router.get('/dashboard', async (req, res) => {
  const merchantId = req.session.user.merchant_id;
  const [bookings, summary] = await Promise.all([
    bookingModel.getMerchantBookings(merchantId).catch(() => []),
    revenueModel.getMerchantRevenueSummary(merchantId).catch(() => ({})),
  ]);
  res.render('merchant/dashboard', { title: 'Merchant Dashboard', bookings, summary });
});

router.get('/revenue', async (req, res) => {
  const merchantId = req.session.user.merchant_id;
  const [summary, transactions, monthly] = await Promise.all([
    revenueModel.getMerchantRevenueSummary(merchantId).catch(() => ({})),
    revenueModel.getMerchantTransactions(merchantId).catch(() => []),
    revenueModel.getMonthlyRevenue(merchantId).catch(() => []),
  ]);
  res.render('merchant/revenue', { title: 'Revenue Report', summary, transactions, monthly });
});

router.post('/bookings/:bookingId/arrived', async (req, res) => {
  await bookingModel.updateBookingStatus(req.params.bookingId, 'arrived').catch(console.error);
  res.redirect('/merchant/dashboard');
});

router.post('/bookings/:bookingId/complete', async (req, res) => {
  await bookingModel.updateBookingStatus(req.params.bookingId, 'completed').catch(console.error);
  res.redirect('/merchant/dashboard');
});

router.get('/qr',             qrCtrl.showQRPage);
router.post('/qr/generate',   qrCtrl.generateQRCode);
router.post('/qr/regenerate', qrCtrl.regenerateQRCode);

router.get('/promotions',                  promoCtrl.showPromotions);
router.post('/promotions/create',          promoCtrl.createPromotion);
router.post('/promotions/:promoId/toggle', promoCtrl.togglePromotion);
router.post('/promotions/:promoId/delete', promoCtrl.deletePromotion);

router.get('/featured',           featCtrl.showFeaturedPage);
router.post('/featured/save',     featCtrl.upload.single('image'), featCtrl.saveFeaturedListing);
router.post('/featured/toggle',   featCtrl.toggleVisibility);

router.get('/services',                      svcCtrl.showServices);
router.post('/services/add',                 svcCtrl.addService);
router.post('/services/:id/toggle',          svcCtrl.toggleService);
router.post('/services/:id/delete',          svcCtrl.deleteService);

module.exports = router;
