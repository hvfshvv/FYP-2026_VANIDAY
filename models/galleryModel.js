const db = require('../config/db');

let schemaReady = false;

async function ensureGallerySchema() {
  if (schemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS gallery_post (
      post_id INT AUTO_INCREMENT PRIMARY KEY,
      customer_id INT NOT NULL,
      merchant_id INT NOT NULL,
      service_id INT NOT NULL,
      booking_id INT NOT NULL,
      image_path VARCHAR(255) NOT NULL,
      image_data LONGBLOB NULL,
      image_mime VARCHAR(50) NULL,
      caption VARCHAR(300) NULL,
      status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'approved',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_gallery_booking (booking_id),
      INDEX idx_gallery_merchant (merchant_id),
      INDEX idx_gallery_service (service_id),
      INDEX idx_gallery_status_created (status, created_at),
      CONSTRAINT fk_gallery_post_customer FOREIGN KEY (customer_id) REFERENCES users(user_id),
      CONSTRAINT fk_gallery_post_merchant FOREIGN KEY (merchant_id) REFERENCES merchant(merchant_id),
      CONSTRAINT fk_gallery_post_service FOREIGN KEY (service_id) REFERENCES service(service_id),
      CONSTRAINT fk_gallery_post_booking FOREIGN KEY (booking_id) REFERENCES booking(booking_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS gallery_interaction (
      interaction_id INT AUTO_INCREMENT PRIMARY KEY,
      post_id INT NOT NULL,
      customer_id INT NOT NULL,
      interaction_type ENUM('like','save','report') NOT NULL,
      reason ENUM('Inappropriate content','Offensive language','Spam','Irrelevant content','Other') NULL,
      status ENUM('active','ignored') NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_gallery_interaction (post_id, customer_id, interaction_type),
      INDEX idx_gallery_interaction_type (interaction_type, status),
      CONSTRAINT fk_gallery_interaction_post FOREIGN KEY (post_id) REFERENCES gallery_post(post_id) ON DELETE CASCADE,
      CONSTRAINT fk_gallery_interaction_customer FOREIGN KEY (customer_id) REFERENCES users(user_id)
    )
  `);

  const [imageColumns] = await db.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'gallery_post'
       AND COLUMN_NAME IN ('image_data', 'image_mime')`
  );
  const existingImageColumns = new Set(imageColumns.map(column => column.COLUMN_NAME));
  if (!existingImageColumns.has('image_data')) {
    await db.query('ALTER TABLE gallery_post ADD COLUMN image_data LONGBLOB NULL AFTER image_path');
  }
  if (!existingImageColumns.has('image_mime')) {
    await db.query('ALTER TABLE gallery_post ADD COLUMN image_mime VARCHAR(50) NULL AFTER image_data');
  }

  schemaReady = true;
}

function gallerySelect(viewerId = null) {
  return `
    SELECT gp.post_id, gp.customer_id, gp.merchant_id, gp.service_id, gp.booking_id,
           CASE
             WHEN gp.image_mime IS NOT NULL THEN CONCAT('/gallery/images/', gp.post_id)
             ELSE gp.image_path
           END AS image_path,
           gp.caption, gp.created_at,
           u.full_name AS customer_name,
           m.merchant_name,
           s.service_name, s.category AS service_category,
           COUNT(DISTINCT gl.interaction_id) AS like_count,
           COUNT(DISTINCT gs.interaction_id) AS save_count,
           MAX(CASE WHEN gl.customer_id = ? THEN 1 ELSE 0 END) AS viewer_liked,
           MAX(CASE WHEN gs.customer_id = ? THEN 1 ELSE 0 END) AS viewer_saved,
           MAX(CASE WHEN gr.customer_id = ? THEN 1 ELSE 0 END) AS viewer_reported
    FROM gallery_post gp
    JOIN users u ON u.user_id = gp.customer_id
    JOIN merchant m ON m.merchant_id = gp.merchant_id
    JOIN service s ON s.service_id = gp.service_id
    LEFT JOIN gallery_interaction gl ON gl.post_id = gp.post_id AND gl.interaction_type = 'like'
    LEFT JOIN gallery_interaction gs ON gs.post_id = gp.post_id AND gs.interaction_type = 'save'
    LEFT JOIN gallery_interaction gr ON gr.post_id = gp.post_id AND gr.interaction_type = 'report'
  `;
}

async function getApprovedPosts({ category = null, viewerId = null, merchantId = null, savedOnly = false, limit = null } = {}) {
  await ensureGallerySchema();
  const safeViewerId = viewerId || 0;
  const clauses = ["gp.status = 'approved'"];
  const params = [safeViewerId, safeViewerId, safeViewerId];

  if (category) {
    clauses.push('LOWER(s.category) = LOWER(?)');
    params.push(category);
  }
  if (merchantId) {
    clauses.push('gp.merchant_id = ?');
    params.push(merchantId);
  }
  if (savedOnly) {
    clauses.push("EXISTS (SELECT 1 FROM gallery_interaction mine WHERE mine.post_id = gp.post_id AND mine.customer_id = ? AND mine.interaction_type = 'save')");
    params.push(safeViewerId);
  }

  let limitSql = '';
  if (Number.isInteger(limit) && limit > 0) {
    limitSql = 'LIMIT ?';
    params.push(limit);
  }

  const [rows] = await db.query(
    `${gallerySelect(viewerId)}
     WHERE ${clauses.join(' AND ')}
     GROUP BY gp.post_id, gp.customer_id, gp.merchant_id, gp.service_id, gp.booking_id,
              gp.image_path, gp.image_mime, gp.caption, gp.created_at, u.full_name, m.merchant_name,
              s.service_name, s.category
     ORDER BY gp.created_at DESC, gp.post_id DESC
     ${limitSql}`,
    params
  );
  return rows;
}

async function getAvailableCategories() {
  await ensureGallerySchema();
  const [rows] = await db.query(
    `SELECT DISTINCT s.category
     FROM gallery_post gp
     JOIN service s ON s.service_id = gp.service_id
     WHERE gp.status = 'approved'
       AND s.category IS NOT NULL
       AND TRIM(s.category) <> ''`
  );
  return rows.map(row => row.category);
}

async function getCompletedBookingForPost(bookingId, customerId) {
  await ensureGallerySchema();
  const [rows] = await db.query(
    `SELECT b.booking_id, b.customer_id, b.merchant_id, b.service_id, b.status,
            ts.slot_date AS booking_date, ts.start_time AS booking_time,
            m.merchant_name, s.service_name, s.category AS service_category,
            gp.post_id AS gallery_post_id
     FROM booking b
     JOIN time_slot ts ON ts.slot_id = b.slot_id
     JOIN merchant m ON m.merchant_id = b.merchant_id
     JOIN service s ON s.service_id = b.service_id
     LEFT JOIN gallery_post gp ON gp.booking_id = b.booking_id
     WHERE b.booking_id = ?
       AND b.customer_id = ?
       AND b.status = 'completed'
     LIMIT 1`,
    [bookingId, customerId]
  );
  return rows[0] || null;
}

async function getPostedBookingIds(customerId) {
  await ensureGallerySchema();
  const [rows] = await db.query('SELECT booking_id, post_id FROM gallery_post WHERE customer_id = ?', [customerId]);
  return rows;
}

async function createPost({ bookingId, customerId, imageData, imageMime, caption }) {
  await ensureGallerySchema();
  const booking = await getCompletedBookingForPost(bookingId, customerId);
  if (!booking) throw new Error('Only your completed bookings can be shared.');
  if (booking.gallery_post_id) throw new Error('This booking already has an Inspiration Gallery post.');

  try {
    // Posts publish immediately, but only after ownership and completed-booking checks.
    const [result] = await db.query(
      `INSERT INTO gallery_post
         (customer_id, merchant_id, service_id, booking_id, image_path, image_data, image_mime, caption, status)
       VALUES (?, ?, ?, ?, '', ?, ?, ?, 'approved')`,
      [customerId, booking.merchant_id, booking.service_id, booking.booking_id, imageData, imageMime, caption || null]
    );
    return result.insertId;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new Error('This booking already has an Inspiration Gallery post.');
    }
    throw err;
  }
}

async function getPostImage(postId) {
  await ensureGallerySchema();
  const [rows] = await db.query(
    `SELECT image_data, image_mime
     FROM gallery_post
     WHERE post_id = ?
       AND status = 'approved'
       AND image_data IS NOT NULL
     LIMIT 1`,
    [postId]
  );
  return rows[0] || null;
}

async function likePost(postId, customerId) {
  await ensureGallerySchema();
  const [result] = await db.query(
    `INSERT IGNORE INTO gallery_interaction (post_id, customer_id, interaction_type)
     SELECT post_id, ?, 'like' FROM gallery_post WHERE post_id = ? AND status = 'approved'`,
    [customerId, postId]
  );
  return result.affectedRows;
}

async function unlikePost(postId, customerId) {
  await ensureGallerySchema();
  const [result] = await db.query(
    "DELETE FROM gallery_interaction WHERE post_id = ? AND customer_id = ? AND interaction_type = 'like'",
    [postId, customerId]
  );
  return result.affectedRows;
}

async function savePost(postId, customerId) {
  await ensureGallerySchema();
  const [result] = await db.query(
    `INSERT IGNORE INTO gallery_interaction (post_id, customer_id, interaction_type)
     SELECT post_id, ?, 'save' FROM gallery_post WHERE post_id = ? AND status = 'approved'`,
    [customerId, postId]
  );
  return result.affectedRows;
}

async function unsavePost(postId, customerId) {
  await ensureGallerySchema();
  const [result] = await db.query(
    "DELETE FROM gallery_interaction WHERE post_id = ? AND customer_id = ? AND interaction_type = 'save'",
    [postId, customerId]
  );
  return result.affectedRows;
}

async function reportPost(postId, customerId, reason) {
  await ensureGallerySchema();
  const [result] = await db.query(
    `INSERT IGNORE INTO gallery_interaction (post_id, customer_id, interaction_type, reason)
     SELECT post_id, ?, 'report', ? FROM gallery_post WHERE post_id = ? AND status = 'approved'`,
    [customerId, reason, postId]
  );
  return result.affectedRows;
}

async function getReportedPosts() {
  await ensureGallerySchema();
  const [rows] = await db.query(
    `SELECT gp.post_id,
            CASE
              WHEN gp.image_mime IS NOT NULL THEN CONCAT('/gallery/images/', gp.post_id)
              ELSE gp.image_path
            END AS image_path,
            gp.caption, gp.created_at,
            poster.full_name AS customer_name, m.merchant_name, s.service_name,
            COUNT(gr.interaction_id) AS report_count,
            GROUP_CONCAT(DISTINCT gr.reason ORDER BY gr.reason SEPARATOR ', ') AS report_reasons,
            MAX(gr.created_at) AS latest_report_at
     FROM gallery_interaction gr
     JOIN gallery_post gp ON gp.post_id = gr.post_id
     JOIN users poster ON poster.user_id = gp.customer_id
     JOIN merchant m ON m.merchant_id = gp.merchant_id
     JOIN service s ON s.service_id = gp.service_id
     WHERE gr.interaction_type = 'report'
       AND gr.status = 'active'
     GROUP BY gp.post_id, gp.image_path, gp.image_mime, gp.caption, gp.created_at,
              poster.full_name, m.merchant_name, s.service_name
     ORDER BY report_count DESC, latest_report_at DESC`
  );
  return rows;
}

async function dismissReports(postId) {
  await ensureGallerySchema();
  // Ignored reports remain stored so the same customer cannot repeatedly report a post.
  const [result] = await db.query(
    "UPDATE gallery_interaction SET status = 'ignored' WHERE post_id = ? AND interaction_type = 'report' AND status = 'active'",
    [postId]
  );
  return result.affectedRows;
}

async function deletePost(postId) {
  await ensureGallerySchema();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[post]] = await connection.query('SELECT image_path FROM gallery_post WHERE post_id = ? FOR UPDATE', [postId]);
    if (!post) {
      await connection.rollback();
      return null;
    }
    await connection.query('DELETE FROM gallery_post WHERE post_id = ?', [postId]);
    await connection.commit();
    return post;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function deleteCustomerPost(postId, customerId) {
  await ensureGallerySchema();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[post]] = await connection.query(
      'SELECT image_path FROM gallery_post WHERE post_id = ? AND customer_id = ? FOR UPDATE',
      [postId, customerId]
    );
    if (!post) {
      await connection.rollback();
      return null;
    }
    await connection.query('DELETE FROM gallery_post WHERE post_id = ? AND customer_id = ?', [postId, customerId]);
    await connection.commit();
    return post;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = {
  ensureGallerySchema,
  getApprovedPosts,
  getAvailableCategories,
  getCompletedBookingForPost,
  getPostedBookingIds,
  createPost,
  getPostImage,
  likePost,
  unlikePost,
  savePost,
  unsavePost,
  reportPost,
  getReportedPosts,
  dismissReports,
  deletePost,
  deleteCustomerPost,
};
