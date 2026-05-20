const db = require('../config/db');
const promotionModel = require('./promotionModel');
const { withResolvedMerchantImage } = require('../utils/merchantImages');

async function getFeaturedListings(category = null) {
  await promotionModel.ensurePromotionSchema();

  const params = [];
  let categoryFilter = '';

  if (category) {
    categoryFilter = ' AND LOWER(m.category) = LOWER(?)';
    params.push(category);
  }

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
       p.title AS promo_title
     FROM featured_listing fl
     JOIN merchant m   ON fl.merchant_id = m.merchant_id
     JOIN users u ON u.user_id = m.user_id
     LEFT JOIN promotion p ON fl.promo_id = p.promo_id
       AND p.approval_status = 'approved'
       AND p.is_active = 1
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
     ORDER BY fl.display_order ASC, fl.created_at DESC`,
    params
  );
  return rows.map(withResolvedMerchantImage);
}

async function getMerchantListing(merchantId) {
  await promotionModel.ensurePromotionSchema();

  const [rows] = await db.query(
    `SELECT fl.*, p.title AS promo_title
     FROM featured_listing fl
     LEFT JOIN promotion p ON fl.promo_id = p.promo_id
       AND p.approval_status = 'approved'
       AND p.is_active = 1
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
