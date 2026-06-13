-- Inspiration Gallery uses only two tables:
--   gallery_post        stores verified customer showcase posts
--   gallery_interaction stores likes, saves, and reports

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
  FOREIGN KEY (customer_id) REFERENCES users(user_id),
  FOREIGN KEY (merchant_id) REFERENCES merchant(merchant_id),
  FOREIGN KEY (service_id) REFERENCES service(service_id),
  FOREIGN KEY (booking_id) REFERENCES booking(booking_id)
);

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
  FOREIGN KEY (post_id) REFERENCES gallery_post(post_id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES users(user_id)
);

-- Add shared image columns when upgrading an existing gallery_post table.
SET @has_gallery_image_data = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'gallery_post'
    AND COLUMN_NAME = 'image_data'
);
SET @gallery_image_data_sql = IF(
  @has_gallery_image_data = 0,
  'ALTER TABLE gallery_post ADD COLUMN image_data LONGBLOB NULL AFTER image_path',
  'SELECT 1'
);
PREPARE gallery_image_data_stmt FROM @gallery_image_data_sql;
EXECUTE gallery_image_data_stmt;
DEALLOCATE PREPARE gallery_image_data_stmt;

SET @has_gallery_image_mime = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'gallery_post'
    AND COLUMN_NAME = 'image_mime'
);
SET @gallery_image_mime_sql = IF(
  @has_gallery_image_mime = 0,
  'ALTER TABLE gallery_post ADD COLUMN image_mime VARCHAR(50) NULL AFTER image_data',
  'SELECT 1'
);
PREPARE gallery_image_mime_stmt FROM @gallery_image_mime_sql;
EXECUTE gallery_image_mime_stmt;
DEALLOCATE PREPARE gallery_image_mime_stmt;
