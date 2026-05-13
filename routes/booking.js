const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/bookingController');

router.get('/',                ctrl.showPortalBookingPage);
router.get('/:token',          ctrl.showBookingPage);
router.post('/:token/confirm', ctrl.confirmBooking);

module.exports = router;
