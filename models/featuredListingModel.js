const db = require('../config/db');
const promotionModel = require('./promotionModel');
const { withResolvedMerchantImage } = require('../utils/merchantImages');

async function getFeaturedListings(category = null) {
  await promotionModel.ensurePromotionSchema();

  const params = [];
  let categoryFilter = '';

  if (category) {
    categoryFilter = `AND EXISTS (
      SELECT 1
      FROM service sf
      WHERE sf.merchant_id = m.merchant_id
        AND sf.is_active = 1
        AND LOWER(sf.category) = LOWER(?)
    )`;
    params.push(category);
  }

  // Feature only approved merchants and approved active promotions.
  const [rows] = await db.query(
    `SELECT
       fl.listing_id,
       fl.merchant_id,
       fl.promo_id,
       fl.title,
       fl.description,
       fl.display_order,
       fl.is_visible,
       fl.start_date,
       fl.end_date,
       fl.created_at,
       m.profile_image AS image_path,
       m.merchant_name,
       m.address,
       m.category,
       COALESCE(
         GROUP_CONCAT(DISTINCT NULLIF(svc.category, '') ORDER BY svc.category SEPARATOR ', '),
         NULLIF(m.category, '')
       ) AS service_categories,
       COALESCE(AVG(r.rating), 0) AS average_rating,
       COUNT(DISTINCT r.review_id) AS review_count,
       (
         SELECT GROUP_CONCAT(
           CONCAT(
             LEFT(ma.day_of_week, 3),
             ' ',
             TIME_FORMAT(ma.start_time, '%H:%i'),
             '-',
             TIME_FORMAT(ma.end_time, '%H:%i')
           )
           ORDER BY FIELD(ma.day_of_week, 'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')
           SEPARATOR ', '
         )
         FROM merchant_availability ma
         WHERE ma.merchant_id = m.merchant_id
           AND ma.is_active = 1
       ) AS operating_hours,
       p.title AS promo_title,
       p.discount_pct
     FROM featured_listing fl
     JOIN merchant m   ON fl.merchant_id = m.merchant_id
     JOIN users u ON u.user_id = m.user_id
     LEFT JOIN service svc ON svc.merchant_id = m.merchant_id AND svc.is_active = 1
     LEFT JOIN reviews r ON r.merchant_id = m.merchant_id AND r.review_target = 'merchant'
     LEFT JOIN promotion p ON fl.promo_id = p.promo_id
       AND p.approval_status = 'approved'
       AND p.is_active = 1
       AND p.discount_pct > 0
       AND p.start_date <= CURDATE()
       AND p.end_date >= CURDATE()
       AND (
         p.applicable_days IS NULL
         OR p.applicable_days = ''
         OR FIND_IN_SET(LOWER(DATE_FORMAT(CURDATE(), '%a')), p.applicable_days) > 0
       )
     WHERE fl.is_visible = 1
       AND m.is_active = 1
       AND u.status = 'active'
       AND m.verification_status = 'approved'
       ${categoryFilter}
     GROUP BY
       fl.listing_id,
       fl.merchant_id,
       fl.promo_id,
       fl.title,
       fl.description,
       fl.display_order,
       fl.is_visible,
       fl.start_date,
       fl.end_date,
       fl.created_at,
       m.profile_image,
       m.merchant_name,
       m.address,
       m.category,
       p.title,
       p.discount_pct
     ORDER BY fl.display_order ASC, fl.created_at DESC`,
    params
  );
  return rows.map(withResolvedMerchantImage);
}

async function getMerchantListing(merchantId) {
  await promotionModel.ensurePromotionSchema();

  // Load merchant listing with only approved promotion details.
  const [rows] = await db.query(
    `SELECT fl.*, p.title AS promo_title
     FROM featured_listing fl
     LEFT JOIN promotion p ON fl.promo_id = p.promo_id
       AND p.approval_status = 'approved'
       AND p.is_active = 1
       AND p.discount_pct > 0
       AND p.start_date <= CURDATE()
       AND p.end_date >= CURDATE()
       AND (
         p.applicable_days IS NULL
         OR p.applicable_days = ''
         OR FIND_IN_SET(LOWER(DATE_FORMAT(CURDATE(), '%a')), p.applicable_days) > 0
       )
     WHERE fl.merchant_id = ?`,
    [merchantId]
  );
  return rows[0] || null;
}

async function upsertFeaturedListing({ merchantId, promoId, title, description, imagePath }) {
  const existing = await getMerchantListing(merchantId);
  if (existing) {
    await db.query(
      'UPDATE featured_listing SET promo_id=?, title=?, description=?, image_path=? WHERE merchant_id=?',
      [promoId || null, title, description, imagePath || existing.image_path, merchantId]
    );
    return existing.listing_id;
  }
  const [result] = await db.query(
    'INSERT INTO featured_listing (merchant_id, promo_id, title, description, image_path) VALUES (?,?,?,?,?)',
    [merchantId, promoId || null, title, description, imagePath || null]
  );
  return result.insertId;
}

async function toggleListingVisibility(merchantId) {
  await db.query(
    'UPDATE featured_listing SET is_visible = NOT is_visible WHERE merchant_id = ?',
    [merchantId]
  );
}

module.exports = { getFeaturedListings, getMerchantListing, upsertFeaturedListing, toggleListingVisibility };
