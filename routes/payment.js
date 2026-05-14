const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/paymentController');

router.get('/checkout/:bookingId',  ctrl.showCheckout);
router.post('/checkout/:bookingId', ctrl.processPayment);
router.get('/success',              ctrl.paymentSuccess);

module.exports = router;
