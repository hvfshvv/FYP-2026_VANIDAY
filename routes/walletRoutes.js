const express = require('express');
const controller = require('../controllers/walletController');

const router = express.Router();
router.use(controller.requireCustomer);
router.get('/', controller.showWallet);
router.get('/history', controller.showHistory);
router.post('/topup/card', controller.createCardTopup);
router.post('/topup/card/confirm', controller.confirmCardTopup);
router.post('/topup/paynow', controller.createPayNowTopup);
router.get('/topup-success', controller.topupSuccess);

module.exports = router;
