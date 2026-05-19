const express = require('express');
const router = express.Router();
const { requireLogin, requireAdmin } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

router.use(requireLogin, requireAdmin);

router.get('/dashboard', adminController.showDashboard);
router.get('/merchants', adminController.showMerchants);
router.post('/merchants/:merchantId/feature', adminController.featureMerchantFromDashboard);
router.get('/customers', adminController.showCustomers);
router.get('/user-management', adminController.showUserManagementHome);
router.get('/user-management/customers', adminController.showManagedCustomers);
router.get('/user-management/customers/:customerId/bookings', adminController.showCustomerBookings);
router.post('/user-management/customers/:customerId/status', adminController.updateCustomerAccountStatus);
router.get('/user-management/merchants', adminController.showManagedMerchants);
router.get('/user-management/merchants/:merchantId/bookings', adminController.showMerchantBookings);
router.post('/user-management/merchants/:merchantId/status', adminController.updateMerchantAccountStatus);
router.get('/merchant-validations', adminController.showMerchantValidations);
router.post('/merchant-validations/:merchantId/approve', adminController.approveMerchant);
router.post('/merchant-validations/:merchantId/reject', adminController.rejectMerchant);
router.get('/campaigns', adminController.showCampaigns);
router.post('/campaigns/create', adminController.createCampaign);
router.post('/campaigns/:voucherId/toggle', adminController.toggleCampaign);
router.get('/:page(validation|featured)', adminController.showComingSoon);

module.exports = router;
