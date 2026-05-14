const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/bookingController');
const { requireLogin } = require('../middleware/auth');

router.get('/',                ctrl.showPortalBookingPage);
router.post('/confirm',        ctrl.confirmPortalBooking);
router.get('/viewBookings',    requireLogin, ctrl.viewCustomerBookings);
router.get('/:token',          ctrl.showBookingPage);
router.post('/:token/confirm', ctrl.confirmBooking);

module.exports = router;
