const db = require('../config/db');
const { withResolvedMerchantImage } = require('../utils/merchantImages');
const reviewModel = require('./reviewModel');

let merchantStripeSchemaReady = false;

async function merchantColumnExists(columnName) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'merchant'
       AND COLUMN_NAME = ?`,
    [columnName]
  );
  return Number(row.count || 0) > 0;
}

async function addMerchantColumn(columnName, ddl) {
  if (!(await merchantColumnExists(columnName))) {
    await db.query(`ALTER TABLE merchant ADD COLUMN ${ddl}`);
  }
}

async function ensureMerchantStripeSchema() {
  if (merchantStripeSchemaReady) return;

  await addMerchantColumn('stripe_account_id', 'stripe_account_id VARCHAR(255) NULL');
  await addMerchantColumn('stripe_account_charges_enabled', 'stripe_account_charges_enabled TINYINT(1) NOT NULL DEFAULT 0');
  await addMerchantColumn('stripe_account_payouts_enabled', 'stripe_account_payouts_enabled TINYINT(1) NOT NULL DEFAULT 0');
  await addMerchantColumn('stripe_account_details_submitted', 'stripe_account_details_submitted TINYINT(1) NOT NULL DEFAULT 0');
  await addMerchantColumn('stripe_account_status_checked_at', 'stripe_account_status_checked_at DATETIME NULL');

  merchantStripeSchemaReady = true;
}

async function getMerchantById(merchantId) {
  await reviewModel.ensureReviewSchema();
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
     LEFT JOIN reviews r ON r.merchant_id = m.merchant_id AND r.review_target = 'merchant' AND r.visibility = 'visible'
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

async function getAllActiveMerchants(category = null, searchQuery = '') {
  await reviewModel.ensureReviewSchema();
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

  let searchFilter = '';
  if (searchQuery) {
    const searchTerm = `%${searchQuery}%`;
    searchFilter = `AND (
      m.merchant_name LIKE ?
      OR EXISTS (
        SELECT 1
        FROM service ss
        WHERE ss.merchant_id = m.merchant_id
          AND ss.is_active = 1
          AND ss.service_name LIKE ?
      )
    )`;
    params.push(searchTerm, searchTerm);
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
      GROUP_CONCAT(DISTINCT NULLIF(s.service_name, '') ORDER BY s.service_name SEPARATOR ', ') AS service_names,
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
    LEFT JOIN reviews r ON r.merchant_id = m.merchant_id AND r.review_target = 'merchant' AND r.visibility = 'visible'
    WHERE m.is_active = 1
      AND u.status = 'active'
      AND m.verification_status = 'approved'
      ${categoryFilter}
      ${searchFilter}
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
  await ensureMerchantStripeSchema();
  const [rows] = await db.query(
    `SELECT merchant_id, merchant_name, description, category, address, contact_no, profile_image,
            stripe_account_id, stripe_account_charges_enabled, stripe_account_payouts_enabled,
            stripe_account_details_submitted, stripe_account_status_checked_at
     FROM merchant
     WHERE merchant_id = ?`,
    [merchantId]
  );

  return withResolvedMerchantImage(rows[0] || null);
}

async function getMerchantAccountProfile(merchantId) {
  await ensureMerchantStripeSchema();
  const [rows] = await db.query(
    `SELECT m.*, u.full_name, u.email AS login_email, u.phone AS owner_phone
     FROM merchant m
     JOIN users u ON u.user_id = m.user_id
     WHERE m.merchant_id = ?
     LIMIT 1`,
    [merchantId]
  );

  return withResolvedMerchantImage(rows[0] || null);
}

async function updateMerchantAccountProfile(merchantId, userId, profile) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      'UPDATE users SET full_name = ?, phone = ? WHERE user_id = ? AND role = ?',
      [profile.fullName, profile.ownerPhone || null, userId, 'merchant']
    );
    await connection.query(
      `UPDATE merchant
       SET email = ?, contact_no = ?, address = ?, description = ?
       WHERE merchant_id = ? AND user_id = ?`,
      [
        profile.businessEmail,
        profile.businessPhone || null,
        profile.address,
        profile.description || null,
        merchantId,
        userId,
      ]
    );
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  return getMerchantAccountProfile(merchantId);
}

async function getMerchantStripeAccount(merchantId) {
  await ensureMerchantStripeSchema();
  const [[row]] = await db.query(
    `SELECT m.merchant_id, m.merchant_name, m.description, m.email,
            m.stripe_account_id, m.stripe_account_charges_enabled,
            m.stripe_account_payouts_enabled, m.stripe_account_details_submitted,
            m.stripe_account_status_checked_at
     FROM merchant m
     WHERE m.merchant_id = ?`,
    [merchantId]
  );
  return row || null;
}

async function saveMerchantStripeAccountId(merchantId, stripeAccountId) {
  await ensureMerchantStripeSchema();
  await db.query(
    `UPDATE merchant
     SET stripe_account_id = ?
     WHERE merchant_id = ?`,
    [stripeAccountId, merchantId]
  );
}

async function updateMerchantStripeAccountStatus(merchantId, account) {
  await ensureMerchantStripeSchema();
  await db.query(
    `UPDATE merchant
     SET stripe_account_charges_enabled = ?,
         stripe_account_payouts_enabled = ?,
         stripe_account_details_submitted = ?,
         stripe_account_status_checked_at = NOW()
     WHERE merchant_id = ?`,
    [
      account?.charges_enabled ? 1 : 0,
      account?.payouts_enabled ? 1 : 0,
      account?.details_submitted ? 1 : 0,
      merchantId,
    ]
  );
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
  ensureMerchantStripeSchema,
  getMerchantById,
  getMerchantServices,
  getAllActiveMerchants,
  getMerchantProfile,
  getMerchantAccountProfile,
  updateMerchantAccountProfile,
  getMerchantStripeAccount,
  saveMerchantStripeAccountId,
  updateMerchantStripeAccountStatus,
  updateMerchantProfileImage
};
