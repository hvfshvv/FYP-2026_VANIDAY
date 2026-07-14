const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/bookingController');
const reviewCtrl = require('../controllers/reviewController');
const { requireLogin, blockMerchantBookingAccess } = require('../middleware/auth');

router.use(blockMerchantBookingAccess);

router.get('/api/slots', ctrl.getAvailableSlots);
router.get('/api/staff', ctrl.getAvailableStaff);
router.get('/api/email-member', ctrl.checkEmailMember);

router.get('/viewBookings', requireLogin, ctrl.viewCustomerBookings);
router.post('/waitlist/:waitlistId/confirm', requireLogin, ctrl.confirmWaitlistOffer);
router.post('/waitlist/:waitlistId/cancel', requireLogin, ctrl.cancelWaitlistRequest);
router.post('/:bookingId/cancel', requireLogin, ctrl.cancelCustomerBooking);
router.get('/:bookingId/reschedule', requireLogin, ctrl.showRescheduleBooking);
router.post('/:bookingId/reschedule', requireLogin, ctrl.rescheduleCustomerBooking);
router.get('/:bookingId/review', requireLogin, reviewCtrl.showBookingReview);
router.post('/:bookingId/review', requireLogin, reviewCtrl.handleReviewUpload, reviewCtrl.submitBookingReview);

router.get('/', requireLogin, ctrl.showPortalBookingPage);
router.post('/confirm', requireLogin, ctrl.confirmPortalBooking);
router.post('/waitlist', requireLogin, ctrl.joinWaitlistFromPortal);
router.get('/:bookingId/rebook', requireLogin, ctrl.rebookBooking);
router.get('/arrival/:token', ctrl.confirmArrivalByQR);

// Keep QR booking public only if walk-in QR guests are allowed
router.get('/:token', ctrl.showBookingPage);
router.get('/:token/waitlist', (req, res) => {
  res.redirect(`/book/${encodeURIComponent(req.params.token)}`);
});
router.post('/:token/waitlist', requireLogin, ctrl.joinWaitlistFromQR);
router.post('/:token/confirm', ctrl.confirmBooking);

module.exports = router;
