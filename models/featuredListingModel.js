const db = require('../config/db');

async function getFeaturedListings(category = null) {
  const params = [];
  let categoryFilter = '';

  if (category) {
    categoryFilter = ' AND LOWER(m.category) = LOWER(?)';
    params.push(category);
  }

  const [rows] = await db.query(
    `SELECT fl.*, m.merchant_name, m.address, m.category, p.title AS promo_title
     FROM featured_listing fl
     JOIN merchant m   ON fl.merchant_id = m.merchant_id
     LEFT JOIN promotion p ON fl.promo_id = p.promo_id
     WHERE fl.is_visible = 1
       AND m.is_active = 1
       AND m.verification_status = 'approved'
       ${categoryFilter}
     ORDER BY fl.display_order ASC, fl.created_at DESC`,
    params
  );
  return rows;
}

async function getMerchantListing(merchantId) {
  const [rows] = await db.query(
    `SELECT fl.*, p.title AS promo_title
     FROM featured_listing fl
     LEFT JOIN promotion p ON fl.promo_id = p.promo_id
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
