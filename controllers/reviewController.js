const reviewModel = require('../models/reviewModel');

function safeRating(value) {
  const rating = Number(value);
  return Number.isInteger(rating) ? rating : null;
}

async function showBookingReview(req, res) {
  try {
    const customerId = req.session.user.customer_id;
    const booking = await reviewModel.getCompletedBookingForReview(
      req.params.bookingId,
      customerId
    );

    if (!booking) {
      return res.redirect('/book/viewBookings?error=Only completed bookings can be reviewed.');
    }

    if (booking.merchant_review_id) {
      return res.redirect('/book/viewBookings?error=You have already reviewed this booking.');
    }

    res.render('booking/review', {
      title: 'Leave a Review',
      booking,
      error: null,
      formValues: {},
    });
  } catch (err) {
    console.error(err);
    res.redirect('/book/viewBookings?error=Could not load review form.');
  }
}

async function submitBookingReview(req, res) {
  const customerId = req.session.user.customer_id;
  const formValues = req.body || {};

  try {
    await reviewModel.submitBookingReview({
      bookingId: req.params.bookingId,
      customerId,
      merchantRating: safeRating(req.body.merchant_rating),
      merchantReviewText: String(req.body.merchant_review_text || '').trim(),
      platformRating: safeRating(req.body.platform_rating),
      platformFeedbackType: req.body.platform_feedback_type,
      platformFeedbackText: String(req.body.platform_feedback_text || '').trim(),
    });

    res.redirect('/book/viewBookings?success=Thanks for sharing your review.');
  } catch (err) {
    console.error(err);

    const booking = await reviewModel.getCompletedBookingForReview(
      req.params.bookingId,
      customerId
    ).catch(() => null);

    if (!booking) {
      return res.redirect('/book/viewBookings?error=Could not submit review.');
    }

    res.status(400).render('booking/review', {
      title: 'Leave a Review',
      booking,
      error: err.message || 'Could not submit review.',
      formValues,
    });
  }
}

async function showMerchantReviews(req, res) {
  const merchantId = req.session.user.merchant_id;

  try {
    const [reviews, summary] = await Promise.all([
      reviewModel.getMerchantReviews(merchantId),
      reviewModel.getMerchantReviewSummary(merchantId),
    ]);

    res.render('merchant/reviews', {
      title: 'Customer Reviews',
      reviews,
      summary,
      success: req.query.success,
      error: req.query.error,
    });
  } catch (err) {
    console.error(err);
    res.render('merchant/reviews', {
      title: 'Customer Reviews',
      reviews: [],
      summary: {},
      success: null,
      error: 'Could not load reviews.',
    });
  }
}

async function replyToReview(req, res) {
  const merchantId = req.session.user.merchant_id;

  try {
    const affectedRows = await reviewModel.replyToMerchantReview(
      req.params.reviewId,
      merchantId,
      req.body.reply_text
    );

    const query = affectedRows ? 'success=Reply saved.' : 'error=Review not found.';
    res.redirect(`/merchant/reviews?${query}`);
  } catch (err) {
    console.error(err);
    res.redirect(`/merchant/reviews?error=${encodeURIComponent(err.message || 'Could not save reply.')}`);
  }
}

module.exports = {
  showBookingReview,
  submitBookingReview,
  showMerchantReviews,
  replyToReview,
};
