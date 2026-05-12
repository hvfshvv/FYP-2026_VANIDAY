const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/marketplaceController');

router.get('/', ctrl.showHome);
router.get('/marketplace', ctrl.showMarketplace);
router.get('/marketplace/merchant/:id', ctrl.showMerchantDetails);

module.exports = router;