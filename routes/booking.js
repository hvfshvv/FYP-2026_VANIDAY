const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/bookingController');
const { requireLogin } = require('../middleware/auth');

router.get('/api/slots', ctrl.getAvailableSlots);

router.get('/viewBookings', requireLogin, ctrl.viewCustomerBookings);
router.post('/:bookingId/cancel', requireLogin, ctrl.cancelCustomerBooking);
router.get('/:bookingId/reschedule', requireLogin, ctrl.showRescheduleBooking);
router.post('/:bookingId/reschedule', requireLogin, ctrl.rescheduleCustomerBooking);

router.get('/', requireLogin, ctrl.showPortalBookingPage);
router.post('/confirm', requireLogin, ctrl.confirmPortalBooking);

router.get('/arrival/:token', ctrl.confirmArrivalByQR);

// Keep QR booking public only if walk-in QR guests are allowed
router.get('/:token', ctrl.showBookingPage);
router.post('/:token/confirm', ctrl.confirmBooking);

module.exports = router;