const express = require('express');
const router = express.Router();
const loyaltyController = require('../controllers/loyaltyController');

// Display the customer's points balance, tier, rewards and transaction history.
router.get('/', loyaltyController.showWallet);

// Spend points on a selected reward voucher.
router.post('/redeem/:rewardId', loyaltyController.redeemReward);

module.exports = router;
