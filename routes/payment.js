const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/paymentController');

router.get('/checkout/:bookingId',  ctrl.showCheckout);
router.post('/stripe/:bookingId',   ctrl.processStripe);
router.get('/success',              ctrl.paymentSuccess);

module.exports = router;
