const multer = require('multer');
const reviewModel = require('../models/reviewModel');
const notificationModel = require('../models/notificationModel');

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

function currentCustomerId(req) {
  return req.session.user.customer_id || req.session.user.user_id;
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

function handleReviewEditUpload(req, res, next) {
  upload.single('review_image')(req, res, err => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5MB or smaller.' : err.message || 'Could not upload image.';
    res.redirect(`/book/reviews/${req.params.reviewId}/edit?error=${encodeURIComponent(message)}`);
  });
}

async function showBookingReview(req, res) {
  try {
    const customerId = currentCustomerId(req);
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
  const customerId = currentCustomerId(req);
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
    await notificationModel.notifyReviewReward({
      customerId,
      bookingId: req.params.bookingId,
      points: result.points,
    }).catch(err => {
      console.error('[notification] review reward notification failed:', err.message);
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

async function showMyReviews(req, res) {
  try {
    const reviews = await reviewModel.getCustomerReviews(currentCustomerId(req));
    res.render('customer/reviews', {
      title: 'My Reviews', reviews,
      success: req.query.success || null, error: req.query.error || null,
    });
  } catch (err) {
    console.error(err);
    res.render('customer/reviews', { title: 'My Reviews', reviews: [], success: null, error: 'Could not load your reviews.' });
  }
}

async function showEditReview(req, res) {
  try {
    const review = await reviewModel.getCustomerReviewForEdit(req.params.reviewId, currentCustomerId(req));
    if (!review) return res.redirect('/book/reviews?error=Review not found.');
    if (new Date(review.edit_deadline).getTime() < Date.now()) return res.redirect('/book/reviews?error=The 7-day editing period has ended.');
    res.render('customer/editReview', { title: 'Edit Review', review, error: req.query.error || null });
  } catch (err) {
    console.error(err);
    res.redirect('/book/reviews?error=Could not load the review editor.');
  }
}

async function updateReview(req, res) {
  try {
    let imageData = null;
    let imageMime = null;
    if (req.file) {
      imageMime = detectedImageMime(req.file.buffer);
      if (!imageMime) throw new Error('The selected file is not a valid JPG, PNG, or WebP image.');
      imageData = req.file.buffer;
    }
    const result = await reviewModel.updateCustomerReview({
      reviewId: req.params.reviewId,
      customerId: currentCustomerId(req),
      merchantRating: req.body.merchant_rating,
      merchantReviewText: req.body.merchant_review_text,
      platformRating: req.body.platform_rating,
      platformFeedbackType: req.body.platform_feedback_type,
      platformFeedbackText: req.body.platform_feedback_text,
      reviewImageData: imageData,
      reviewImageMime: imageMime,
    });
    const message = result.photoPointAwarded ? 'Review updated. 1 additional photo point was added.' : 'Review updated.';
    res.redirect(`/book/reviews?success=${encodeURIComponent(message)}`);
  } catch (err) {
    console.error(err);
    res.redirect(`/book/reviews/${req.params.reviewId}/edit?error=${encodeURIComponent(err.message || 'Could not update review.')}`);
  }
}

async function requestPhotoRemoval(req, res) {
  try {
    await reviewModel.requestPhotoRemoval({
      reviewId: req.params.reviewId,
      customerId: currentCustomerId(req),
      reasonType: req.body.reason_type,
      reasonText: req.body.reason_text,
    });
    res.redirect('/book/reviews?success=' + encodeURIComponent('Your photo is hidden while an administrator reviews the removal request.'));
  } catch (err) {
    res.redirect('/book/reviews?error=' + encodeURIComponent(err.message || 'Could not submit removal request.'));
  }
}

async function showAdminReviews(req, res) {
  try {
    const [requests, recentReviews] = await Promise.all([
      reviewModel.getAdminReviews({ status: 'requests' }),
      reviewModel.getAdminReviews({ status: 'all', excludeRequests: true, limit: 5 }),
    ]);
    res.render('admin/reviews', { title: 'Review Moderation', requests, recentReviews, success: req.query.success || null, error: req.query.error || null });
  } catch (err) {
    console.error(err);
    res.render('admin/reviews', { title: 'Review Moderation', requests: [], recentReviews: [], success: null, error: 'Could not load reviews.' });
  }
}

async function showAllAdminReviews(req, res) {
  const filters = {
    status: req.query.status || 'all',
    photo: req.query.photo || 'all',
    search: String(req.query.search || '').trim(),
  };
  try {
    const reviews = await reviewModel.getAdminReviews(filters);
    res.render('admin/allReviews', { title: 'All Merchant Reviews', reviews, filters, success: req.query.success || null, error: req.query.error || null });
  } catch (err) {
    console.error(err);
    res.render('admin/allReviews', { title: 'All Merchant Reviews', reviews: [], filters, success: null, error: 'Could not load reviews.' });
  }
}

async function showAdminReviewImage(req, res) {
  try {
    const image = await reviewModel.getAdminReviewImage(req.params.reviewId);
    if (!image) return res.status(404).send('Review image not found.');
    res.type(image.review_image_mime).send(image.review_image_data);
  } catch (err) { res.status(500).send('Could not load review image.'); }
}

async function moderateReview(req, res) {
  try {
    const review = await reviewModel.moderateReview({
      reviewId: req.params.reviewId,
      adminId: req.session.user.user_id,
      action: req.body.action,
      reason: req.body.reason,
      requestId: req.body.request_id || null,
    });
    const messages = {
      remove_photo: `Your photo for ${review.service_name} was removed by an administrator. Your written review remains visible. Reason: ${req.body.reason}`,
      approve_request: `Your requested photo removal for ${review.service_name} was approved. Your written review remains visible.`,
      reject_request: `Your photo-removal request for ${review.service_name} was not approved. Reason: ${req.body.reason}`,
      hide_review: `Your review for ${review.service_name} was hidden because it violated our content policy. Reason: ${req.body.reason}`,
      restore_review: `Your review for ${review.service_name} has been restored.`,
    };
    await notificationModel.createNotification({
      userId: review.customer_id, bookingId: review.booking_id,
      title: 'Review moderation update', message: messages[req.body.action] || 'An administrator updated your review.',
      notificationType: 'review_moderation',
    });
    res.redirect('/admin/reviews?success=' + encodeURIComponent('Review moderation action completed and the customer was notified.'));
  } catch (err) {
    console.error(err);
    res.redirect('/admin/reviews?error=' + encodeURIComponent(err.message || 'Could not moderate review.'));
  }
}

module.exports = {
  handleReviewUpload,
  showBookingReview,
  submitBookingReview,
  showMerchantReviews,
  replyToReview,
  handleReviewEditUpload,
  showMyReviews,
  showEditReview,
  updateReview,
  requestPhotoRemoval,
  showAdminReviews,
  showAllAdminReviews,
  showAdminReviewImage,
  moderateReview,
};
