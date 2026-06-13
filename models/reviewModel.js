const db = require('../config/db');
const loyaltyModel = require('./loyaltyModel');

let schemaReady = false;

async function reviewColumnExists(columnName) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'merchant_review'
       AND COLUMN_NAME = ?`,
    [columnName]
  );

  return Number(rows[0]?.count || 0) > 0;
}

async function addReviewColumnIfMissing(columnName, ddl) {
  if (await reviewColumnExists(columnName)) return;

  try {
    await db.query(`ALTER TABLE merchant_review ADD COLUMN ${ddl}`);
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') return;
    throw err;
  }
}

async function ensureReviewSchema() {
  if (schemaReady) return;

  await addReviewColumnIfMissing('merchant_reply', 'merchant_reply TEXT NULL AFTER review_text');
  await addReviewColumnIfMissing('merchant_replied_at', 'merchant_replied_at DATETIME NULL AFTER merchant_reply');

  schemaReady = true;
}

async function getCompletedBookingForReview(bookingId, customerId) {
  await ensureReviewSchema();

  const [rows] = await db.query(
    `SELECT b.booking_id, b.customer_id, b.merchant_id, b.service_id, b.staff_id,
            b.status, b.total_amount, b.created_at,
            ts.slot_date AS booking_date,
            ts.start_time AS booking_time,
            m.merchant_name,
            s.service_name,
            mr.review_id AS merchant_review_id,
            pf.feedback_id AS platform_feedback_id
     FROM booking b
     JOIN time_slot ts ON ts.slot_id = b.slot_id
     JOIN merchant m ON m.merchant_id = b.merchant_id
     JOIN service s ON s.service_id = b.service_id
     LEFT JOIN merchant_review mr ON mr.booking_id = b.booking_id
     LEFT JOIN platform_feedback pf ON pf.booking_id = b.booking_id
     WHERE b.booking_id = ?
       AND b.customer_id = ?
       AND b.status = 'completed'
     LIMIT 1`,
    [bookingId, customerId]
  );

  return rows[0] || null;
}

async function submitBookingReview({
  bookingId,
  customerId,
  merchantRating,
  merchantReviewText = null,
  platformRating = null,
  platformFeedbackType = 'booking_experience',
  platformFeedbackText = null,
}) {
  await ensureReviewSchema();

  const booking = await getCompletedBookingForReview(bookingId, customerId);
  if (!booking) {
    throw new Error('Only completed bookings can be reviewed.');
  }

  if (booking.merchant_review_id) {
    throw new Error('You have already reviewed this booking.');
  }

  const safeMerchantRating = Number(merchantRating);
  if (!Number.isInteger(safeMerchantRating) || safeMerchantRating < 1 || safeMerchantRating > 5) {
    throw new Error('Please choose a merchant rating from 1 to 5 stars.');
  }

  const safeMerchantReviewText = String(merchantReviewText || '').trim();
  if (!safeMerchantReviewText) {
    throw new Error('Please write a comment for your merchant review.');
  }

  const safePlatformRating = Number(platformRating);
  if (!Number.isInteger(safePlatformRating) || safePlatformRating < 1 || safePlatformRating > 5) {
    throw new Error('Please choose a Uniday rating from 1 to 5 stars.');
  }

  const safePlatformFeedbackText = String(platformFeedbackText || '').trim();
  if (!safePlatformFeedbackText) {
    throw new Error('Please write a comment for your Uniday feedback.');
  }

  const allowedFeedbackTypes = ['booking_experience', 'payment', 'qr_checkin', 'whatsapp', 'general'];
  const safeFeedbackType = allowedFeedbackTypes.includes(platformFeedbackType)
    ? platformFeedbackType
    : 'booking_experience';

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      `INSERT INTO merchant_review
        (booking_id, customer_id, merchant_id, service_id, staff_id, rating, review_text)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        booking.booking_id,
        customerId,
        booking.merchant_id,
        booking.service_id,
        booking.staff_id || null,
        safeMerchantRating,
        safeMerchantReviewText,
      ]
    );

    if (!booking.platform_feedback_id) {
      await connection.query(
        `INSERT INTO platform_feedback
          (booking_id, customer_id, rating, feedback_type, feedback_text)
         VALUES (?, ?, ?, ?, ?)`,
        [
          booking.booking_id,
          customerId,
          safePlatformRating,
          safeFeedbackType,
          safePlatformFeedbackText,
        ]
      );
    }

    await loyaltyModel.awardReviewBonusPoints(customerId, booking.booking_id, connection);

    await connection.commit();
  } catch (err) {
    await connection.rollback();

    if (err.code === 'ER_DUP_ENTRY') {
      throw new Error('You have already reviewed this booking.');
    }

    throw err;
  } finally {
    connection.release();
  }
}

async function getMerchantReviews(merchantId) {
  await ensureReviewSchema();

  const [rows] = await db.query(
    `SELECT r.review_id, r.booking_id, r.rating, r.review_text, r.created_at,
            r.merchant_reply, r.merchant_replied_at,
            u.full_name AS customer_name,
            s.service_name,
            st.full_name AS staff_name
     FROM merchant_review r
     JOIN users u ON u.user_id = r.customer_id
     JOIN service s ON s.service_id = r.service_id
     LEFT JOIN staff st ON st.staff_id = r.staff_id
     WHERE r.merchant_id = ?
     ORDER BY r.created_at DESC, r.review_id DESC`,
    [merchantId]
  );

  return rows;
}

async function getMerchantReviewSummary(merchantId, periodStart = null) {
  await ensureReviewSchema();
  const selectedPeriod = periodStart || new Date().toISOString().slice(0, 7) + '-01';

  const [rows] = await db.query(
    `SELECT COUNT(CASE WHEN created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 MONTH) THEN 1 END) AS review_count,
            COALESCE(AVG(CASE WHEN created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 MONTH) THEN rating END), 0) AS average_rating,
            COUNT(CASE WHEN merchant_reply IS NULL OR TRIM(merchant_reply) = '' THEN 1 END) AS awaiting_reply,
            (SELECT latest.rating
             FROM merchant_review latest
             WHERE latest.merchant_id = ?
             ORDER BY latest.created_at DESC, latest.review_id DESC
             LIMIT 1) AS latest_rating,
            (SELECT latest.created_at
             FROM merchant_review latest
             WHERE latest.merchant_id = ?
             ORDER BY latest.created_at DESC, latest.review_id DESC
             LIMIT 1) AS latest_review_at
     FROM merchant_review
     WHERE merchant_id = ?`,
    [selectedPeriod, selectedPeriod, selectedPeriod, selectedPeriod, merchantId, merchantId, merchantId]
  );

  return rows[0] || { review_count: 0, average_rating: 0, latest_rating: null, latest_review_at: null };
}

async function replyToMerchantReview(reviewId, merchantId, replyText) {
  await ensureReviewSchema();

  const safeReply = String(replyText || '').trim();
  if (!safeReply) {
    throw new Error('Reply cannot be empty.');
  }

  const [result] = await db.query(
    `UPDATE merchant_review
     SET merchant_reply = ?,
         merchant_replied_at = NOW()
     WHERE review_id = ?
       AND merchant_id = ?`,
    [safeReply, reviewId, merchantId]
  );

  return result.affectedRows;
}

async function getRecentMerchantReviews(merchantId, limit = 6) {
  await ensureReviewSchema();

  const [rows] = await db.query(
    `SELECT r.review_id, r.rating, r.review_text, r.created_at,
            r.merchant_reply, r.merchant_replied_at,
            u.full_name AS customer_name,
            s.service_name
     FROM merchant_review r
     JOIN users u ON u.user_id = r.customer_id
     JOIN service s ON s.service_id = r.service_id
     WHERE r.merchant_id = ?
     ORDER BY r.created_at DESC, r.review_id DESC
     LIMIT ?`,
    [merchantId, Number(limit) || 6]
  );

  return rows;
}

module.exports = {
  ensureReviewSchema,
  getCompletedBookingForReview,
  submitBookingReview,
  getMerchantReviews,
  getMerchantReviewSummary,
  replyToMerchantReview,
  getRecentMerchantReviews,
};
