const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/paymentController');

router.get('/checkout/:bookingId',        ctrl.showCheckout);
router.post('/create-payment-intent',     ctrl.createStripeIntent);
router.post('/create-intent/:bookingId',  ctrl.createStripeIntent);
router.post('/confirm-stripe/:bookingId', ctrl.confirmStripePayment);
router.post('/fail-stripe/:bookingId',    ctrl.markStripePaymentFailed);
router.post('/paynow-session/:bookingId', ctrl.createPayNowSession);
router.get('/success',                    ctrl.paymentSuccess);
router.get('/receipt/:bookingId.pdf',     ctrl.downloadReceipt);

module.exports = router;
