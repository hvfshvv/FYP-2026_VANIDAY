const express = require('express');
const router = express.Router();
const { requireLogin, requireAdmin } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

router.use(requireLogin, requireAdmin);

router.get('/dashboard', adminController.showDashboard);
router.get('/merchants', adminController.showMerchants);
router.get('/customers', adminController.showCustomers);
router.get('/merchant-validations', adminController.showMerchantValidations);
router.post('/merchant-validations/:merchantId/approve', adminController.approveMerchant);
router.post('/merchant-validations/:merchantId/reject', adminController.rejectMerchant);
router.get('/campaigns', adminController.showCampaigns);
router.post('/campaigns/create', adminController.createCampaign);
router.post('/campaigns/:voucherId/toggle', adminController.toggleCampaign);
router.get('/:page(validation|featured)', adminController.showComingSoon);

module.exports = router;
