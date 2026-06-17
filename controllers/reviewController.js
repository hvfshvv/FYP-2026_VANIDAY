const multer = require('multer');
const reviewModel = require('../models/reviewModel');

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) return cb(new Error('Please upload a JPG, PNG, or WebP image.'));
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

function safeRating(value) {
  const rating = Number(value);
  return Number.isInteger(rating) ? rating : null;
}

function detectedImageMime(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

function handleReviewUpload(req, res, next) {
  upload.single('review_image')(req, res, err => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Image must be 5MB or smaller.'
      : err.message || 'Could not upload image.';
    res.redirect(`/book/${req.params.bookingId}/review?error=${encodeURIComponent(message)}`);
  });
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
      error: req.query.error || null,
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
    let reviewImageData = null;
    let reviewImageMime = null;
    if (req.file) {
      reviewImageMime = detectedImageMime(req.file.buffer);
      if (!reviewImageMime) {
        throw new Error('The selected file is not a valid JPG, PNG, or WebP image.');
      }
      reviewImageData = req.file.buffer;
    }

    const result = await reviewModel.submitBookingReview({
      bookingId: req.params.bookingId,
      customerId,
      merchantRating: safeRating(req.body.merchant_rating),
      merchantReviewText: String(req.body.merchant_review_text || '').trim(),
      platformRating: safeRating(req.body.platform_rating),
      platformFeedbackType: req.body.platform_feedback_type,
      platformFeedbackText: String(req.body.platform_feedback_text || '').trim(),
      reviewImageData,
      reviewImageMime,
    });

    res.redirect(`/book/viewBookings?success=${encodeURIComponent(`Thanks for sharing your review. ${result.points} loyalty points have been added to your wallet.`)}`);
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
  handleReviewUpload,
  showBookingReview,
  submitBookingReview,
  showMerchantReviews,
  replyToReview,
};
