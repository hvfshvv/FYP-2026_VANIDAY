const express = require('express');
const router = express.Router();
const loyaltyController = require('../controllers/loyaltyController');

router.get('/', loyaltyController.showWallet);
router.post('/redeem/:rewardId', loyaltyController.redeemReward);

module.exports = router;
