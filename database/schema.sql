-- =============================================================
-- Unified Booking System | Vaniday | SOI-2026-2610-0035
-- Database: SOI-2026-0052-mizyana
-- =============================================================
-- Section 1 : Shared / Core  (used by all team members)
-- Section 4 : Hafsha         (QR_CODE, PROMOTION, FEATURED_LISTING)
-- =============================================================

CREATE DATABASE IF NOT EXISTS `SOI-2026-0052-mizyana`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `SOI-2026-0052-mizyana`;

-- ============================================================
-- SECTION 1 : SHARED / CORE TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS USERS (
    user_id       INT           NOT NULL AUTO_INCREMENT,
    full_name     VARCHAR(100)  NOT NULL,
    email         VARCHAR(150)  NOT NULL UNIQUE,
    password_hash VARCHAR(255)  NOT NULL,
    phone         VARCHAR(20)   DEFAULT NULL,
    role          ENUM('customer','merchant','admin') NOT NULL DEFAULT 'customer',
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id)
);

CREATE TABLE IF NOT EXISTS MERCHANT (
    merchant_id   INT           NOT NULL AUTO_INCREMENT,
    user_id       INT           NOT NULL,
    merchant_name VARCHAR(100)  NOT NULL,
    email         VARCHAR(150)  NOT NULL UNIQUE,
    phone         VARCHAR(20)   DEFAULT NULL,
    address       TEXT          DEFAULT NULL,
    is_featured   TINYINT(1)    NOT NULL DEFAULT 0,
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (merchant_id),
    CONSTRAINT fk_merchant_user FOREIGN KEY (user_id) REFERENCES USERS (user_id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS SERVICE (
    service_id    INT            NOT NULL AUTO_INCREMENT,
    merchant_id   INT            NOT NULL,
    service_name  VARCHAR(100)   NOT NULL,
    description   TEXT           DEFAULT NULL,
    price         DECIMAL(10,2)  NOT NULL,
    duration_mins INT            NOT NULL,
    is_active     TINYINT(1)     NOT NULL DEFAULT 1,
    PRIMARY KEY (service_id),
    CONSTRAINT fk_service_merchant FOREIGN KEY (merchant_id) REFERENCES MERCHANT (merchant_id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS TIME_SLOT (
    slot_id      INT        NOT NULL AUTO_INCREMENT,
    merchant_id  INT        NOT NULL,
    service_id   INT        NOT NULL,
    slot_date    DATE       NOT NULL,
    slot_time    TIME       NOT NULL,
    is_available TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (slot_id),
    CONSTRAINT fk_slot_merchant FOREIGN KEY (merchant_id) REFERENCES MERCHANT (merchant_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_slot_service  FOREIGN KEY (service_id)  REFERENCES SERVICE  (service_id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- QR_CODE declared before BOOKING so BOOKING can reference it
CREATE TABLE IF NOT EXISTS QR_CODE (
    qr_id         INT          NOT NULL AUTO_INCREMENT,
    merchant_id   INT          NOT NULL,
    qr_token      VARCHAR(255) NOT NULL UNIQUE,
    qr_image_path VARCHAR(255) DEFAULT NULL,
    is_active     TINYINT(1)   NOT NULL DEFAULT 1,
    generated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (qr_id),
    CONSTRAINT fk_qr_merchant FOREIGN KEY (merchant_id) REFERENCES MERCHANT (merchant_id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS BOOKING (
    booking_id   INT      NOT NULL AUTO_INCREMENT,
    customer_id  INT      NOT NULL,
    service_id   INT      NOT NULL,
    merchant_id  INT      NOT NULL,
    qr_id        INT      DEFAULT NULL,
    booking_date DATE     NOT NULL,
    booking_time TIME     NOT NULL,
    status       ENUM('pending','confirmed','arrived','cancelled','completed') NOT NULL DEFAULT 'pending',
    source       ENUM('qr_scan','whatsapp','web','portal')                    NOT NULL DEFAULT 'web',
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (booking_id),
    CONSTRAINT fk_booking_customer FOREIGN KEY (customer_id) REFERENCES USERS    (user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_booking_service  FOREIGN KEY (service_id)  REFERENCES SERVICE  (service_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_booking_merchant FOREIGN KEY (merchant_id) REFERENCES MERCHANT (merchant_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_booking_qr       FOREIGN KEY (qr_id)       REFERENCES QR_CODE  (qr_id)
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS PAYMENT (
    payment_id      INT            NOT NULL AUTO_INCREMENT,
    booking_id      INT            NOT NULL UNIQUE,
    amount          DECIMAL(10,2)  NOT NULL,
    payment_method  ENUM('stripe','paypal','paynow') NOT NULL,
    payment_status  ENUM('pending','success','failed','refunded') NOT NULL DEFAULT 'pending',
    transaction_ref VARCHAR(255)   DEFAULT NULL,
    commission_pct  DECIMAL(5,2)   NOT NULL DEFAULT 20.00,
    vaniday_share   DECIMAL(10,2)  DEFAULT NULL,
    merchant_share  DECIMAL(10,2)  DEFAULT NULL,
    paid_at         DATETIME       DEFAULT NULL,
    PRIMARY KEY (payment_id),
    CONSTRAINT fk_payment_booking FOREIGN KEY (booking_id) REFERENCES BOOKING (booking_id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS NOTIFICATION (
    notification_id INT          NOT NULL AUTO_INCREMENT,
    user_id         INT          NOT NULL,
    booking_id      INT          DEFAULT NULL,
    message         TEXT         NOT NULL,
    channel         ENUM('email','whatsapp') NOT NULL DEFAULT 'email',
    is_sent         TINYINT(1)   NOT NULL DEFAULT 0,
    sent_at         DATETIME     DEFAULT NULL,
    PRIMARY KEY (notification_id),
    CONSTRAINT fk_notif_user    FOREIGN KEY (user_id)    REFERENCES USERS   (user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_notif_booking FOREIGN KEY (booking_id) REFERENCES BOOKING (booking_id)
        ON DELETE SET NULL ON UPDATE CASCADE
);

-- ============================================================
-- SECTION 4 : HAFSHA — QR-Based Cashless Booking & Marketplace
-- ============================================================

-- QR_CODE already created above

CREATE TABLE IF NOT EXISTS PROMOTION (
    promo_id     INT            NOT NULL AUTO_INCREMENT,
    merchant_id  INT            NOT NULL,
    title        VARCHAR(150)   NOT NULL,
    description  TEXT           DEFAULT NULL,
    discount_pct DECIMAL(5,2)   NOT NULL,
    start_date   DATE           NOT NULL,
    end_date     DATE           NOT NULL,
    is_active    TINYINT(1)     NOT NULL DEFAULT 1,
    PRIMARY KEY (promo_id),
    CONSTRAINT fk_promo_merchant FOREIGN KEY (merchant_id) REFERENCES MERCHANT (merchant_id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS FEATURED_LISTING (
    listing_id  INT          NOT NULL AUTO_INCREMENT,
    merchant_id INT          NOT NULL,
    promo_id    INT          DEFAULT NULL,
    title       VARCHAR(150) NOT NULL,
    description TEXT         DEFAULT NULL,
    image_path  VARCHAR(255) DEFAULT NULL,
    is_visible  TINYINT(1)   NOT NULL DEFAULT 1,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (listing_id),
    CONSTRAINT fk_listing_merchant  FOREIGN KEY (merchant_id) REFERENCES MERCHANT  (merchant_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_listing_promotion FOREIGN KEY (promo_id)    REFERENCES PROMOTION (promo_id)
        ON DELETE SET NULL ON UPDATE CASCADE
);

-- ============================================================
-- SAMPLE / SEED DATA
-- ============================================================

INSERT IGNORE INTO USERS (full_name, email, password_hash, role)
VALUES ('Admin', 'admin@vaniday.com', '$2b$10$placeholder_admin_hash', 'admin');

INSERT IGNORE INTO USERS (full_name, email, password_hash, phone, role)
VALUES ('Glam Studio', 'glam@vaniday.com', '$2b$10$placeholder_merchant_hash', '91234567', 'merchant');

INSERT IGNORE INTO MERCHANT (user_id, merchant_name, email, phone, address, is_featured)
VALUES (2, 'Glam Studio', 'glam@vaniday.com', '91234567', '10 Orchard Road, #02-01, Singapore 238888', 1);

INSERT IGNORE INTO SERVICE (merchant_id, service_name, description, price, duration_mins)
VALUES
  (1, 'Haircut',  'Classic haircut and styling',  35.00, 45),
  (1, 'Facial',   'Deep cleanse facial treatment', 65.00, 60),
  (1, 'Manicure', 'Gel manicure with nail art',    45.00, 50);

INSERT IGNORE INTO PROMOTION (merchant_id, title, description, discount_pct, start_date, end_date)
VALUES (1, '20% Off Facials', 'Book a facial this month and save 20%!', 20.00, '2026-05-01', '2026-05-31');

INSERT IGNORE INTO FEATURED_LISTING (merchant_id, promo_id, title, description)
VALUES (1, 1, 'Glam Studio — May Deals', 'Top-rated salon with exclusive May promotions!');
