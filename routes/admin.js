const express = require('express');
const router = express.Router();
const { requireLogin, requireAdmin } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

// All admin routes require a logged-in admin user.
router.use(requireLogin, requireAdmin);

// Main admin dashboards and analytics pages.
router.get('/dashboard', adminController.showDashboard);
router.get('/merchants', adminController.showMerchants);
router.post('/merchants/:merchantId/feature', adminController.featureMerchantFromDashboard);
router.post('/merchants/featured/:listingId/toggle', adminController.toggleFeaturedMerchantFromDashboard);
router.post('/merchants/featured/:listingId/remove', adminController.removeFeaturedMerchantFromDashboard);
router.get('/featured', adminController.showFeaturedMerchants);
router.post('/featured/:listingId/toggle', adminController.toggleFeaturedMerchant);
router.post('/featured/:listingId/remove', adminController.removeFeaturedMerchant);
router.get('/customers', adminController.showCustomers);

// User management pages for customers and merchants.
router.get('/user-management', adminController.showUserManagementHome);
router.get('/user-management/customers', adminController.showManagedCustomers);
router.get('/user-management/customers/:customerId/bookings', adminController.showCustomerBookings);
router.post('/user-management/customers/:customerId/status', adminController.updateCustomerAccountStatus);
router.get('/user-management/merchants', adminController.showManagedMerchants);
router.get('/user-management/merchants/:merchantId/bookings', adminController.showMerchantBookings);
router.post('/user-management/merchants/:merchantId/status', adminController.updateMerchantAccountStatus);

// Approval workflows for merchant registrations and promotions.
router.get('/merchant-validations', adminController.showMerchantValidations);
router.post('/merchant-validations/:merchantId/approve', adminController.approveMerchant);
router.post('/merchant-validations/:merchantId/reject', adminController.rejectMerchant);
router.get('/promotions', adminController.showPromotionApprovals);
router.post('/promotions/:promoId/approve', adminController.approvePromotion);
router.post('/promotions/:promoId/reject', adminController.rejectPromotion);

// Campaign and voucher management.
router.get('/campaigns', adminController.showCampaigns);
router.post('/campaigns/create', adminController.createCampaign);
router.post('/campaigns/:voucherId/toggle', adminController.toggleCampaign);
router.get('/:page(validation)', adminController.showComingSoon);

module.exports = router;
