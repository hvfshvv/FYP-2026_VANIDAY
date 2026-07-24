const db = require('../config/db');

async function getMerchantInsightRows(merchantId, startDate, endDate) {
  const [rows] = await db.query(
    `SELECT
       b.booking_id,
       b.customer_id,
       b.status,
       b.source,
       b.total_amount,
       ts.slot_date AS booking_date,
       ts.start_time AS booking_time,
       s.service_id,
       s.service_name,
       st.staff_id,
       st.full_name AS staff_name,
       p.amount AS paid_amount,
       p.payment_status,
       r.rating,
       (
         SELECT MIN(first_slot.slot_date)
         FROM booking first_booking
         JOIN time_slot first_slot ON first_slot.slot_id = first_booking.slot_id
         WHERE first_booking.merchant_id = b.merchant_id
           AND first_booking.customer_id = b.customer_id
           AND first_booking.status <> 'payment_failed'
       ) AS first_booking_date
     FROM booking b
     JOIN time_slot ts ON ts.slot_id = b.slot_id
     JOIN service s ON s.service_id = b.service_id
     LEFT JOIN staff st ON st.staff_id = b.staff_id
     LEFT JOIN payment p ON p.booking_id = b.booking_id
     LEFT JOIN reviews r ON r.booking_id = b.booking_id
       AND r.review_target = 'merchant'
       AND r.visibility = 'visible'
     WHERE b.merchant_id = ?
       AND ts.slot_date >= ?
       AND ts.slot_date <= ?
       AND b.status <> 'payment_failed'
     ORDER BY ts.slot_date, ts.start_time`,
    [merchantId, startDate, endDate]
  );
  return rows;
}

async function getMerchantInsightIdentity(merchantId) {
  const [rows] = await db.query(
    `SELECT merchant_id, merchant_name
     FROM merchant
     WHERE merchant_id = ?
     LIMIT 1`,
    [merchantId]
  );
  return rows[0] || null;
}

async function getMerchantOverallRating(merchantId) {
  const [[row]] = await db.query(
    `SELECT
       COALESCE(AVG(r.rating), 0) AS average_rating,
       COUNT(r.review_id) AS review_count
     FROM reviews r
     WHERE r.merchant_id = ?
       AND r.review_target = 'merchant'
       AND r.visibility = 'visible'`,
    [merchantId]
  );
  return {
    averageRating: Number(row?.average_rating || 0),
    reviewCount: Number(row?.review_count || 0),
  };
}

module.exports = {
  getMerchantInsightRows,
  getMerchantInsightIdentity,
  getMerchantOverallRating,
};
