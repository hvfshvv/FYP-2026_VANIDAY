const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/marketplaceController');

router.get('/', ctrl.showMarketplace);
router.get('/marketplace', ctrl.redirectMarketplaceHome);
router.get('/marketplace/merchant/:id', ctrl.showMerchantDetails);

module.exports = router;
