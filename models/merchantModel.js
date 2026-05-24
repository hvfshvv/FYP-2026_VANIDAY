const db = require('../config/db');
const { withResolvedMerchantImage } = require('../utils/merchantImages');

async function getMerchantById(merchantId) {
  const [rows] = await db.query(
    `SELECT
       m.*,
       COALESCE((
         SELECT GROUP_CONCAT(DISTINCT NULLIF(s.category, '') ORDER BY s.category SEPARATOR ', ')
         FROM service s
         WHERE s.merchant_id = m.merchant_id
           AND s.is_active = 1
       ), NULLIF(m.category, '')) AS service_categories,
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
       ) AS operating_hours
     FROM merchant m
     JOIN users u ON u.user_id = m.user_id
     LEFT JOIN merchant_review r ON r.merchant_id = m.merchant_id
     WHERE m.merchant_id = ?
       AND m.is_active = 1
       AND m.verification_status = 'approved'
       AND u.status = 'active'
     GROUP BY m.merchant_id`,
    [merchantId]
  );

  return withResolvedMerchantImage(rows[0] || null);
}

async function getMerchantServices(merchantId) {
  const [rows] = await db.query(
    'SELECT * FROM service WHERE merchant_id = ? AND is_active = 1',
    [merchantId]
  );

  return rows;
}

async function getAllActiveMerchants(category = null) {
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

  const [rows] = await db.query(`
    SELECT
      m.merchant_id,
      m.merchant_name,
      m.description,
      m.category,
      COALESCE(
        GROUP_CONCAT(DISTINCT NULLIF(s.category, '') ORDER BY s.category SEPARATOR ', '),
        NULLIF(m.category, '')
      ) AS service_categories,
      COALESCE(AVG(r.rating), 0) AS average_rating,
      COUNT(DISTINCT r.review_id) AS review_count,
      m.address,
      m.contact_no,
      m.profile_image AS image_path,
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
      ) AS operating_hours
    FROM merchant m
    JOIN users u ON u.user_id = m.user_id
    LEFT JOIN service s ON s.merchant_id = m.merchant_id AND s.is_active = 1
    LEFT JOIN merchant_review r ON r.merchant_id = m.merchant_id
    WHERE m.is_active = 1
      AND u.status = 'active'
      AND m.verification_status = 'approved'
      ${categoryFilter}
    GROUP BY
      m.merchant_id,
      m.merchant_name,
      m.description,
      m.category,
      m.address,
      m.contact_no,
      m.profile_image
    ORDER BY m.merchant_name
  `, params);

  return rows.map(withResolvedMerchantImage);
}

async function getMerchantProfile(merchantId) {
  const [rows] = await db.query(
    `SELECT merchant_id, merchant_name, description, category, address, contact_no, profile_image
     FROM merchant
     WHERE merchant_id = ?`,
    [merchantId]
  );

  return withResolvedMerchantImage(rows[0] || null);
}

async function updateMerchantProfileImage(merchantId, imagePath) {
  await db.query(
    `UPDATE merchant
     SET profile_image = ?
     WHERE merchant_id = ?`,
    [imagePath, merchantId]
  );
}

module.exports = {
  getMerchantById,
  getMerchantServices,
  getAllActiveMerchants,
  getMerchantProfile,
  updateMerchantProfileImage
};
