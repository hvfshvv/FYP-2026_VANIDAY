/*
 * routes/admin.js
 * Mounts all admin panel routes under /admin. Every route requires a
 * logged-in admin user. Controllers are split by domain so each file
 * stays focused on a single concern.
 */

const express = require('express');
const router = express.Router();
const { requireLogin, requireAdmin } = require('../middleware/auth');

// ── CONTROLLER IMPORTS ─────────────────────────────────────────────────────

const dashboardCtrl   = require('../controllers/adminDashboardController');
const validationCtrl  = require('../controllers/adminValidationController');
const merchantCtrl    = require('../controllers/adminMerchantController');
const userCtrl        = require('../controllers/adminUserController');
const campaignCtrl    = require('../controllers/adminCampaignController');
const reviewCtrl      = require('../controllers/reviewController');

// ── AUTH GUARD ─────────────────────────────────────────────────────────────

// All admin routes require a logged-in admin user.
router.use(requireLogin, requireAdmin);

// ── DASHBOARD & ANALYTICS ──────────────────────────────────────────────────

router.get('/dashboard',         dashboardCtrl.showDashboard);
router.get('/revenue',           dashboardCtrl.showRevenueReport);
router.get('/merchants',         dashboardCtrl.showMerchants);
router.get('/customers',         dashboardCtrl.showCustomers);
router.get('/platform-feedback', dashboardCtrl.showPlatformFeedback);
router.get('/reviews', reviewCtrl.showAdminReviews);
router.get('/reviews/all', reviewCtrl.showAllAdminReviews);
router.get('/reviews/:reviewId/image', reviewCtrl.showAdminReviewImage);
router.post('/reviews/:reviewId/moderate', reviewCtrl.moderateReview);

// Featured merchant actions triggered from the analytics leaderboard.
router.post('/merchants/:merchantId/feature',               merchantCtrl.featureMerchantFromDashboard);
router.post('/merchants/featured/:listingId/toggle',        merchantCtrl.toggleFeaturedMerchantFromDashboard);
router.post('/merchants/featured/:listingId/remove',        merchantCtrl.removeFeaturedMerchantFromDashboard);

// Dedicated featured merchants management page.
router.get('/featured',                         merchantCtrl.showFeaturedMerchants);
router.post('/featured/:listingId/toggle',      merchantCtrl.toggleFeaturedMerchant);
router.post('/featured/:listingId/remove',      merchantCtrl.removeFeaturedMerchant);

// ── VALIDATION & SUPPORT LOGS ──────────────────────────────────────────────

router.get('/validation',                       validationCtrl.showValidationLogs);
router.post('/validation/:logId/resolve',       validationCtrl.resolveValidationLog);
router.post('/validation/:logId/reply',         validationCtrl.replyToWhatsAppSupport);

// ── USER MANAGEMENT ────────────────────────────────────────────────────────

// User management pages for customers and merchants.
router.get('/user-management',                                          userCtrl.showUserManagementHome);
router.get('/user-management/customers',                                userCtrl.showManagedCustomers);
router.get('/user-management/customers/:customerId/bookings',           userCtrl.showCustomerBookings);
router.post('/user-management/customers/:customerId/status',            userCtrl.updateCustomerAccountStatus);
router.get('/user-management/merchants',                                userCtrl.showManagedMerchants);
router.get('/user-management/merchants/:merchantId/bookings',           userCtrl.showMerchantBookings);
router.post('/user-management/merchants/:merchantId/status',            userCtrl.updateMerchantAccountStatus);

// ── MERCHANT VALIDATIONS & PROMOTIONS ─────────────────────────────────────

// Approval workflows for merchant registrations and promotions.
router.get('/merchant-validations',                         merchantCtrl.showMerchantValidations);
router.post('/merchant-validations/:merchantId/approve',    merchantCtrl.approveMerchant);
router.post('/merchant-validations/:merchantId/reject',     merchantCtrl.rejectMerchant);
router.get('/promotions',                                   merchantCtrl.showPromotionApprovals);
router.post('/promotions/:promoId/approve',                 merchantCtrl.approvePromotion);
router.post('/promotions/:promoId/reject',                  merchantCtrl.rejectPromotion);

// ── CAMPAIGNS & LOYALTY ────────────────────────────────────────────────────

// Campaign and voucher management.
router.get('/campaigns',                                campaignCtrl.showCampaigns);
router.post('/campaigns/ai-recommendation',             campaignCtrl.generateAiRecommendation);
router.get('/campaigns/vouchers',                       campaignCtrl.showVoucherCampaigns);
router.post('/campaigns/vouchers/create',               campaignCtrl.createCampaign);
router.post('/campaigns/create',                        campaignCtrl.createCampaign);
router.get('/campaigns/vouchers/:voucherId/edit',       campaignCtrl.showEditCampaign);
router.post('/campaigns/vouchers/:voucherId/edit',      campaignCtrl.updateCampaign);
router.post('/campaigns/vouchers/:voucherId/toggle',    campaignCtrl.toggleCampaign);
router.post('/campaigns/:voucherId/toggle',             campaignCtrl.toggleCampaign);
router.get('/campaigns/loyalty',                        campaignCtrl.showLoyaltyRewards);
router.post('/campaigns/loyalty/create',                campaignCtrl.createLoyaltyReward);
router.get('/campaigns/loyalty/:rewardId/edit',         campaignCtrl.showEditLoyaltyReward);
router.post('/campaigns/loyalty/:rewardId/edit',        campaignCtrl.updateLoyaltyReward);
router.post('/campaigns/loyalty/:rewardId/toggle',      campaignCtrl.toggleLoyaltyReward);

module.exports = router;
