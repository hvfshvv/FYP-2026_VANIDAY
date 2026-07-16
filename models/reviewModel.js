const db = require('../config/db');
const loyaltyModel = require('./loyaltyModel');

const MERCHANT_REVIEW_WORD_LIMIT = 120;
let schemaReady = false;

function wordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

async function reviewColumnExists(columnName) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'reviews'
       AND COLUMN_NAME = ?`,
    [columnName]
  );

  return Number(rows[0]?.count || 0) > 0;
}

async function addReviewColumnIfMissing(columnName, ddl) {
  if (await reviewColumnExists(columnName)) return;

  try {
    await db.query(`ALTER TABLE reviews ADD COLUMN ${ddl}`);
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') return;
    throw err;
  }
}

async function ensureReviewSchema() {
  if (schemaReady) return;

  await addReviewColumnIfMissing('merchant_reply', 'merchant_reply TEXT NULL AFTER review_text');
  await addReviewColumnIfMissing('merchant_replied_at', 'merchant_replied_at DATETIME NULL AFTER merchant_reply');
  await addReviewColumnIfMissing('review_image_data', 'review_image_data LONGBLOB NULL AFTER review_text');
  await addReviewColumnIfMissing('review_image_mime', 'review_image_mime VARCHAR(50) NULL AFTER review_image_data');
  await addReviewColumnIfMissing('updated_at', 'updated_at DATETIME NULL AFTER merchant_replied_at');
  await addReviewColumnIfMissing('visibility', "visibility ENUM('visible','hidden') NOT NULL DEFAULT 'visible' AFTER updated_at");
  await addReviewColumnIfMissing('hidden_at', 'hidden_at DATETIME NULL AFTER visibility');
  await addReviewColumnIfMissing('hidden_by', 'hidden_by INT NULL AFTER hidden_at');
  await addReviewColumnIfMissing('hidden_reason', 'hidden_reason VARCHAR(255) NULL AFTER hidden_by');
  await addReviewColumnIfMissing('photo_hidden', 'photo_hidden BOOLEAN NOT NULL DEFAULT FALSE AFTER hidden_reason');
  await addReviewColumnIfMissing('photo_bonus_awarded_at', 'photo_bonus_awarded_at DATETIME NULL AFTER photo_hidden');
  await addReviewColumnIfMissing('edit_count', 'edit_count INT NOT NULL DEFAULT 0 AFTER photo_bonus_awarded_at');
  await addReviewColumnIfMissing('last_edit_summary', 'last_edit_summary JSON NULL AFTER edit_count');
  await addReviewColumnIfMissing('removal_request_status', "removal_request_status ENUM('none','pending','approved','rejected') NOT NULL DEFAULT 'none' AFTER last_edit_summary");
  await addReviewColumnIfMissing('removal_reason_type', "removal_reason_type ENUM('confidential','wrong_photo','safety','other') NULL AFTER removal_request_status");
  await addReviewColumnIfMissing('removal_reason_text', 'removal_reason_text VARCHAR(500) NULL AFTER removal_reason_type');
  await addReviewColumnIfMissing('removal_requested_at', 'removal_requested_at DATETIME NULL AFTER removal_reason_text');
  await addReviewColumnIfMissing('removal_reviewed_by', 'removal_reviewed_by INT NULL AFTER removal_requested_at');
  await addReviewColumnIfMissing('removal_reviewed_at', 'removal_reviewed_at DATETIME NULL AFTER removal_reviewed_by');
  await addReviewColumnIfMissing('removal_admin_note', 'removal_admin_note VARCHAR(500) NULL AFTER removal_reviewed_at');

  // Preserve the fact that legacy photo reviews already received their full
  // three-point reward, so removing/replacing an image cannot earn a fourth.
  await db.query(`UPDATE reviews r
    JOIN transactions t ON t.booking_id = r.booking_id
      AND t.transaction_type = 'review_bonus' AND t.points_amount >= 3
    SET r.photo_bonus_awarded_at = COALESCE(t.completed_at, t.created_at, r.created_at)
    WHERE r.review_target = 'merchant'
      AND r.review_image_data IS NOT NULL
      AND r.photo_bonus_awarded_at IS NULL`);

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
            pf.review_id AS platform_feedback_id
     FROM booking b
     JOIN time_slot ts ON ts.slot_id = b.slot_id
     JOIN merchant m ON m.merchant_id = b.merchant_id
     JOIN service s ON s.service_id = b.service_id
     LEFT JOIN reviews mr ON mr.booking_id = b.booking_id AND mr.review_target = 'merchant'
     LEFT JOIN reviews pf ON pf.booking_id = b.booking_id AND pf.review_target = 'platform'
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
  reviewImageData = null,
  reviewImageMime = null,
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
  if (wordCount(safeMerchantReviewText) > MERCHANT_REVIEW_WORD_LIMIT) {
    throw new Error(`Merchant review must be ${MERCHANT_REVIEW_WORD_LIMIT} words or fewer.`);
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

    const hasReviewImage = Buffer.isBuffer(reviewImageData) && reviewImageMime;

    const [merchantInsert] = await connection.query(
      `INSERT INTO reviews
        (booking_id, customer_id, review_target, merchant_id, service_id, staff_id, rating, review_text, review_image_data, review_image_mime)
       VALUES (?, ?, 'merchant', ?, ?, ?, ?, ?, ?, ?)`,
      [
        booking.booking_id,
        customerId,
        booking.merchant_id,
        booking.service_id,
        booking.staff_id || null,
        safeMerchantRating,
        safeMerchantReviewText,
        hasReviewImage ? reviewImageData : null,
        hasReviewImage ? reviewImageMime : null,
      ]
    );

    if (!booking.platform_feedback_id) {
      await connection.query(
        `INSERT INTO reviews
          (booking_id, customer_id, review_target, rating, feedback_type, review_text)
         VALUES (?, ?, 'platform', ?, ?, ?)`,
        [
          booking.booking_id,
          customerId,
          safePlatformRating,
          safeFeedbackType,
          safePlatformFeedbackText,
        ]
      );
    }

    const bonusPoints = loyaltyModel.getReviewBonusPoints(hasReviewImage);
    await loyaltyModel.awardReviewBonusPoints(customerId, booking.booking_id, connection, bonusPoints);
    if (hasReviewImage) {
      await connection.query(
        'UPDATE reviews SET photo_bonus_awarded_at = NOW() WHERE review_id = ?',
        [merchantInsert.insertId]
      );
    }

    await connection.commit();
    return { points: bonusPoints, hasReviewImage };
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
            CASE WHEN r.review_image_mime IS NOT NULL AND r.photo_hidden = FALSE THEN CONCAT('/client-diaries/images/', r.review_id) ELSE NULL END AS review_image_path,
            r.merchant_reply, r.merchant_replied_at,
            u.full_name AS customer_name,
            s.service_name,
            st.full_name AS staff_name
     FROM reviews r
     JOIN users u ON u.user_id = r.customer_id
     JOIN service s ON s.service_id = r.service_id
     LEFT JOIN staff st ON st.staff_id = r.staff_id
     WHERE r.merchant_id = ? AND r.review_target = 'merchant' AND r.visibility = 'visible'
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
             FROM reviews latest
             WHERE latest.merchant_id = ? AND latest.review_target = 'merchant' AND latest.visibility = 'visible'
             ORDER BY latest.created_at DESC, latest.review_id DESC
             LIMIT 1) AS latest_rating,
            (SELECT latest.created_at
             FROM reviews latest
             WHERE latest.merchant_id = ? AND latest.review_target = 'merchant' AND latest.visibility = 'visible'
             ORDER BY latest.created_at DESC, latest.review_id DESC
             LIMIT 1) AS latest_review_at
     FROM reviews
     WHERE merchant_id = ? AND review_target = 'merchant' AND visibility = 'visible'`,
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
    `UPDATE reviews
     SET merchant_reply = ?,
         merchant_replied_at = NOW()
     WHERE review_id = ?
       AND merchant_id = ?
       AND review_target = 'merchant'`,
    [safeReply, reviewId, merchantId]
  );

  return result.affectedRows;
}

async function getRecentMerchantReviews(merchantId, limit = 6) {
  await ensureReviewSchema();

  const [rows] = await db.query(
    `SELECT r.review_id, r.rating, r.review_text, r.created_at,
            CASE WHEN r.review_image_mime IS NOT NULL AND r.photo_hidden = FALSE THEN CONCAT('/client-diaries/images/', r.review_id) ELSE NULL END AS review_image_path,
            r.merchant_reply, r.merchant_replied_at,
            u.full_name AS customer_name,
            s.service_name
     FROM reviews r
     JOIN users u ON u.user_id = r.customer_id
     JOIN service s ON s.service_id = r.service_id
     WHERE r.merchant_id = ? AND r.review_target = 'merchant' AND r.visibility = 'visible'
     ORDER BY r.created_at DESC, r.review_id DESC
     LIMIT ?`,
    [merchantId, Number(limit) || 6]
  );

  return rows;
}

async function getReviewImage(reviewId) {
  await ensureReviewSchema();

  const [rows] = await db.query(
    `SELECT review_image_data, review_image_mime
     FROM reviews
     WHERE review_id = ?
       AND review_target = 'merchant'
       AND visibility = 'visible'
       AND photo_hidden = FALSE
       AND review_image_data IS NOT NULL
       AND review_image_mime IS NOT NULL
     LIMIT 1`,
    [reviewId]
  );

  return rows[0] || null;
}

async function getPhotoReviewCategories() {
  await ensureReviewSchema();

  const [rows] = await db.query(
    `SELECT DISTINCT s.category
     FROM reviews r
     JOIN service s ON s.service_id = r.service_id
     WHERE r.review_target = 'merchant'
       AND r.review_image_data IS NOT NULL
       AND r.review_image_mime IS NOT NULL
       AND s.category IS NOT NULL
       AND TRIM(s.category) <> ''`
  );

  return rows.map(row => row.category);
}

async function getPhotoReviews({ category = null, limit = null } = {}) {
  await ensureReviewSchema();
  const clauses = [
    "r.review_target = 'merchant'",
    'r.review_image_data IS NOT NULL',
    'r.review_image_mime IS NOT NULL',
    "r.visibility = 'visible'",
    'r.photo_hidden = FALSE',
  ];
  const params = [];

  if (category) {
    clauses.push('LOWER(s.category) = LOWER(?)');
    params.push(category);
  }

  let limitSql = '';
  if (Number.isInteger(limit) && limit > 0) {
    limitSql = 'LIMIT ?';
    params.push(limit);
  }

  const [rows] = await db.query(
    `SELECT r.review_id, r.customer_id, r.merchant_id, r.service_id, r.booking_id,
            r.rating, r.review_text, r.created_at,
            CONCAT('/client-diaries/images/', r.review_id) AS image_path,
            u.full_name AS customer_name,
            m.merchant_name,
            s.service_name,
            s.category AS service_category
     FROM reviews r
     JOIN users u ON u.user_id = r.customer_id
     JOIN merchant m ON m.merchant_id = r.merchant_id
     JOIN service s ON s.service_id = r.service_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY r.created_at DESC, r.review_id DESC
     ${limitSql}`,
    params
  );

  return rows;
}

async function getCustomerReviews(customerId) {
  await ensureReviewSchema();
  const [rows] = await db.query(
    `SELECT mr.review_id, mr.booking_id, mr.rating, mr.review_text, mr.created_at, mr.updated_at,
            mr.visibility, mr.photo_hidden, mr.photo_bonus_awarded_at,
            mr.review_image_mime IS NOT NULL AS has_photo,
            CASE WHEN mr.review_image_mime IS NOT NULL AND mr.photo_hidden = FALSE
              THEN CONCAT('/client-diaries/images/', mr.review_id) ELSE NULL END AS review_image_path,
            mr.merchant_reply, mr.merchant_replied_at,
            pf.review_id AS platform_review_id, pf.rating AS platform_rating,
            pf.review_text AS platform_review_text, pf.feedback_type,
            m.merchant_name, s.service_name, ts.slot_date AS booking_date,
            DATE_ADD(mr.created_at, INTERVAL 7 DAY) AS edit_deadline,
            (mr.removal_request_status = 'pending') AS has_pending_request
     FROM reviews mr
     JOIN booking b ON b.booking_id = mr.booking_id
     JOIN time_slot ts ON ts.slot_id = b.slot_id
     JOIN merchant m ON m.merchant_id = mr.merchant_id
     JOIN service s ON s.service_id = mr.service_id
     LEFT JOIN reviews pf ON pf.booking_id = mr.booking_id AND pf.review_target = 'platform'
     WHERE mr.customer_id = ? AND mr.review_target = 'merchant'
     ORDER BY mr.created_at DESC, mr.review_id DESC`, [customerId]
  );
  return rows;
}

async function getCustomerReviewForEdit(reviewId, customerId) {
  const reviews = await getCustomerReviews(customerId);
  return reviews.find(row => String(row.review_id) === String(reviewId)) || null;
}

async function updateCustomerReview(data) {
  await ensureReviewSchema();
  const review = await getCustomerReviewForEdit(data.reviewId, data.customerId);
  if (!review) throw new Error('Review not found.');
  if (new Date(review.edit_deadline).getTime() < Date.now()) throw new Error('The 7-day editing period has ended.');
  if (review.visibility !== 'visible') throw new Error('A hidden review cannot be edited.');

  const merchantRating = Number(data.merchantRating);
  const platformRating = Number(data.platformRating);
  if (!Number.isInteger(merchantRating) || merchantRating < 1 || merchantRating > 5) throw new Error('Please choose a merchant rating from 1 to 5 stars.');
  if (!Number.isInteger(platformRating) || platformRating < 1 || platformRating > 5) throw new Error('Please choose a Uniday rating from 1 to 5 stars.');
  const merchantText = String(data.merchantReviewText || '').trim();
  const platformText = String(data.platformFeedbackText || '').trim();
  if (!merchantText || !platformText) throw new Error('Both review comments are required.');
  if (wordCount(merchantText) > MERCHANT_REVIEW_WORD_LIMIT) throw new Error(`Merchant review must be ${MERCHANT_REVIEW_WORD_LIMIT} words or fewer.`);
  const allowedTypes = ['booking_experience', 'payment', 'qr_checkin', 'whatsapp', 'general'];
  const feedbackType = allowedTypes.includes(data.platformFeedbackType) ? data.platformFeedbackType : 'booking_experience';
  const hasNewImage = Buffer.isBuffer(data.reviewImageData) && data.reviewImageMime;
  if (hasNewImage && review.has_pending_request) throw new Error('Wait for the pending photo-removal request before replacing the image.');
  const addingFirstPhoto = !review.has_photo && hasNewImage;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const imageSql = hasNewImage ? ', review_image_data = ?, review_image_mime = ?, photo_hidden = FALSE' : '';
    const params = [merchantRating, merchantText];
    if (hasNewImage) params.push(data.reviewImageData, data.reviewImageMime);
    params.push(data.reviewId, data.customerId);
    await connection.query(
      `UPDATE reviews SET rating = ?, review_text = ?, updated_at = NOW() ${imageSql}
       WHERE review_id = ? AND customer_id = ? AND review_target = 'merchant'`, params
    );
    await connection.query(
      `UPDATE reviews SET rating = ?, feedback_type = ?, review_text = ?, updated_at = NOW()
       WHERE booking_id = ? AND customer_id = ? AND review_target = 'platform'`,
      [platformRating, feedbackType, platformText, review.booking_id, data.customerId]
    );
    await connection.query(
      `UPDATE reviews SET edit_count = edit_count + 1, last_edit_summary = ? WHERE review_id = ?`,
      [JSON.stringify({ rating: merchantRating, photoReplaced: Boolean(hasNewImage), editedBy: data.customerId }), data.reviewId]
    );
    let photoPointAwarded = false;
    if (addingFirstPhoto && !review.photo_bonus_awarded_at) {
      const award = await loyaltyModel.awardReviewPhotoBonusPoints(data.customerId, review.booking_id, data.reviewId, connection);
      photoPointAwarded = award.awarded;
      if (award.awarded) await connection.query('UPDATE reviews SET photo_bonus_awarded_at = NOW() WHERE review_id = ?', [data.reviewId]);
    }
    await connection.commit();
    return { photoPointAwarded };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally { connection.release(); }
}

async function requestPhotoRemoval({ reviewId, customerId, reasonType, reasonText }) {
  await ensureReviewSchema();
  if (!['confidential', 'wrong_photo', 'safety', 'other'].includes(reasonType)) throw new Error('Please select a removal reason.');
  const review = await getCustomerReviewForEdit(reviewId, customerId);
  if (!review || !review.has_photo) throw new Error('Photo review not found.');
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    if (review.has_pending_request) throw new Error('A photo-removal request is already pending.');
    await connection.query(
      `UPDATE reviews SET photo_hidden = TRUE, removal_request_status = 'pending',
         removal_reason_type = ?, removal_reason_text = ?, removal_requested_at = NOW(),
         removal_reviewed_by = NULL, removal_reviewed_at = NULL, removal_admin_note = NULL
       WHERE review_id = ? AND customer_id = ?`,
      [reasonType, String(reasonText || '').trim() || null, reviewId, customerId]
    );
    await connection.commit();
  } catch (err) {
    await connection.rollback(); throw err;
  } finally { connection.release(); }
}

async function getAdminReviews({ status = 'all', search = '', photo = 'all', limit = null, excludeRequests = false } = {}) {
  await ensureReviewSchema();
  const clauses = ["r.review_target = 'merchant'"];
  const params = [];
  if (status === 'hidden') clauses.push("r.visibility = 'hidden'");
  if (status === 'visible') clauses.push("r.visibility = 'visible'");
  if (status === 'requests') clauses.push("r.removal_request_status = 'pending'");
  if (excludeRequests) clauses.push("r.removal_request_status <> 'pending'");
  if (photo === 'with') clauses.push('r.review_image_mime IS NOT NULL');
  if (photo === 'without') clauses.push('r.review_image_mime IS NULL');
  if (search) {
    clauses.push('(u.full_name LIKE ? OR m.merchant_name LIKE ? OR s.service_name LIKE ?)');
    const value = `%${search}%`; params.push(value, value, value);
  }
  let limitSql = '';
  if (Number.isInteger(Number(limit)) && Number(limit) > 0) {
    limitSql = 'LIMIT ?';
    params.push(Number(limit));
  }
  const [rows] = await db.query(
    `SELECT r.review_id, r.booking_id, r.customer_id, r.rating, r.review_text, r.created_at,
            r.updated_at, r.visibility, r.hidden_reason, r.photo_hidden,
            r.review_image_mime IS NOT NULL AS has_photo,
            CASE WHEN r.review_image_mime IS NOT NULL THEN CONCAT('/admin/reviews/', r.review_id, '/image') END AS admin_image_path,
            u.full_name AS customer_name, m.merchant_name, s.service_name,
            CASE WHEN r.removal_request_status = 'pending' THEN r.review_id ELSE NULL END AS request_id,
            r.removal_reason_type AS reason_type, r.removal_reason_text AS reason_text,
            r.removal_requested_at AS requested_at
     FROM reviews r
     JOIN users u ON u.user_id = r.customer_id
     JOIN merchant m ON m.merchant_id = r.merchant_id
     JOIN service s ON s.service_id = r.service_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY (r.removal_request_status = 'pending') DESC, r.created_at DESC
     ${limitSql}`, params
  );
  return rows;
}

async function countPendingReviewRequests() {
  await ensureReviewSchema();
  const [[row]] = await db.query(
    "SELECT COUNT(*) AS total FROM reviews WHERE review_target = 'merchant' AND removal_request_status = 'pending'"
  );
  return Number(row?.total || 0);
}

async function getAdminReviewImage(reviewId) {
  await ensureReviewSchema();
  const [[row]] = await db.query(
    `SELECT review_image_data, review_image_mime FROM reviews
     WHERE review_id = ? AND review_target = 'merchant' AND review_image_data IS NOT NULL LIMIT 1`, [reviewId]
  );
  return row || null;
}

async function moderateReview({ reviewId, adminId, action, reason, requestId = null }) {
  await ensureReviewSchema();
  if (!['remove_photo', 'hide_review', 'restore_review', 'approve_request', 'reject_request'].includes(action)) throw new Error('Invalid moderation action.');
  const safeReason = String(reason || '').trim();
  if (!safeReason) throw new Error('A moderation reason is required.');
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[review]] = await connection.query(
      `SELECT r.*, m.merchant_name, s.service_name FROM reviews r
       JOIN merchant m ON m.merchant_id = r.merchant_id JOIN service s ON s.service_id = r.service_id
       WHERE r.review_id = ? AND r.review_target = 'merchant' LIMIT 1`, [reviewId]
    );
    if (!review) throw new Error('Review not found.');
    if (action === 'remove_photo' || action === 'approve_request') {
      await connection.query('UPDATE reviews SET review_image_data = NULL, review_image_mime = NULL, photo_hidden = FALSE WHERE review_id = ?', [reviewId]);
      if (action === 'remove_photo') {
        await connection.query(
          "UPDATE reviews SET removal_request_status = 'approved', removal_reviewed_by = ?, removal_reviewed_at = NOW(), removal_admin_note = ? WHERE review_id = ? AND removal_request_status = 'pending'",
          [adminId, safeReason, reviewId]
        );
      }
    } else if (action === 'hide_review') {
      await connection.query("UPDATE reviews SET visibility = 'hidden', hidden_at = NOW(), hidden_by = ?, hidden_reason = ? WHERE review_id = ?", [adminId, safeReason, reviewId]);
    } else if (action === 'restore_review') {
      await connection.query("UPDATE reviews SET visibility = 'visible', hidden_at = NULL, hidden_by = NULL, hidden_reason = NULL WHERE review_id = ?", [reviewId]);
    } else if (action === 'reject_request') {
      await connection.query('UPDATE reviews SET photo_hidden = FALSE WHERE review_id = ?', [reviewId]);
    }
    if (requestId && (action === 'approve_request' || action === 'reject_request')) {
      await connection.query(
        `UPDATE reviews SET removal_request_status = ?, removal_reviewed_by = ?, removal_reviewed_at = NOW(), removal_admin_note = ?
         WHERE review_id = ? AND removal_request_status = 'pending'`,
        [action === 'approve_request' ? 'approved' : 'rejected', adminId, safeReason, reviewId]
      );
    }
    await connection.query(
      `INSERT INTO admin_action_log (admin_id, action_type, target_table, target_id, description)
       VALUES (?, ?, 'reviews', ?, ?)`,
      [adminId, `REVIEW_${action.toUpperCase()}`, reviewId, safeReason]
    );
    await connection.commit();
    return review;
  } catch (err) {
    await connection.rollback(); throw err;
  } finally { connection.release(); }
}

module.exports = {
  ensureReviewSchema,
  getCompletedBookingForReview,
  submitBookingReview,
  getMerchantReviews,
  getMerchantReviewSummary,
  replyToMerchantReview,
  getRecentMerchantReviews,
  getReviewImage,
  getPhotoReviewCategories,
  getPhotoReviews,
  getCustomerReviews,
  getCustomerReviewForEdit,
  updateCustomerReview,
  requestPhotoRemoval,
  getAdminReviews,
  countPendingReviewRequests,
  getAdminReviewImage,
  moderateReview,
  MERCHANT_REVIEW_WORD_LIMIT,
};
