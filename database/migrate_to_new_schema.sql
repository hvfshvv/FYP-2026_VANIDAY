-- =============================================================
-- Migration: SOI-2026-0052-mizyana → SOI-2026-2610-0035-mizyana
-- Run this once in phpMyAdmin or MySQL CLI.
-- Safe to re-run: uses CREATE TABLE IF NOT EXISTS + INSERT IGNORE.
-- =============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = '';

-- =============================================================
-- STEP 1: Create new database
-- =============================================================

CREATE DATABASE IF NOT EXISTS `SOI-2026-2610-0035-mizyana`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `SOI-2026-2610-0035-mizyana`;

-- =============================================================
-- STEP 2: Create all tables (friend's schema)
-- =============================================================

CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    phone VARCHAR(20) NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('customer', 'merchant', 'admin') NOT NULL,
    status ENUM('active', 'suspended') DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS merchant (
    merchant_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    merchant_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE,
    description TEXT,
    category VARCHAR(100),
    address TEXT,
    business_uen VARCHAR(20),
    contact_no VARCHAR(20),
    profile_image VARCHAR(255),
    is_featured BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    verification_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    verification_notes TEXT NULL,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    verified_at DATETIME NULL,
    verified_by INT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (verified_by) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS service (
    service_id INT AUTO_INCREMENT PRIMARY KEY,
    merchant_id INT NOT NULL,
    service_name VARCHAR(150) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    duration_mins INT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (merchant_id) REFERENCES merchant(merchant_id)
);

CREATE TABLE IF NOT EXISTS staff (
    staff_id INT AUTO_INCREMENT PRIMARY KEY,
    merchant_id INT NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(100),
    bio TEXT,
    profile_image VARCHAR(255),
    experience_years INT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (merchant_id) REFERENCES merchant(merchant_id)
);

CREATE TABLE IF NOT EXISTS staff_service (
    staff_service_id INT AUTO_INCREMENT PRIMARY KEY,
    staff_id INT NOT NULL,
    service_id INT NOT NULL,
    UNIQUE (staff_id, service_id),
    FOREIGN KEY (staff_id) REFERENCES staff(staff_id),
    FOREIGN KEY (service_id) REFERENCES service(service_id)
);

CREATE TABLE IF NOT EXISTS merchant_availability (
    availability_id INT AUTO_INCREMENT PRIMARY KEY,
    merchant_id INT NOT NULL,
    day_of_week ENUM('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (merchant_id) REFERENCES merchant(merchant_id)
);

CREATE TABLE IF NOT EXISTS time_slot (
    slot_id INT AUTO_INCREMENT PRIMARY KEY,
    merchant_id INT NOT NULL,
    service_id INT NOT NULL,
    staff_id INT NULL,
    slot_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (merchant_id) REFERENCES merchant(merchant_id),
    FOREIGN KEY (service_id) REFERENCES service(service_id),
    FOREIGN KEY (staff_id) REFERENCES staff(staff_id)
);

CREATE TABLE IF NOT EXISTS cancellation_policy (
    policy_id INT AUTO_INCREMENT PRIMARY KEY,
    merchant_id INT NOT NULL UNIQUE,
    min_cancel_hours INT NOT NULL DEFAULT 24,
    refund_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    allow_reschedule BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (merchant_id) REFERENCES merchant(merchant_id)
);

CREATE TABLE IF NOT EXISTS qr_code (
    qr_id INT AUTO_INCREMENT PRIMARY KEY,
    merchant_id INT NOT NULL,
    qr_token VARCHAR(255) NOT NULL UNIQUE,
    qr_url VARCHAR(255) NOT NULL,
    qr_image_path VARCHAR(255),
    qr_type ENUM('booking', 'check_in', 'general') DEFAULT 'general',
    is_active BOOLEAN DEFAULT TRUE,
    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (merchant_id) REFERENCES merchant(merchant_id)
);

CREATE TABLE IF NOT EXISTS voucher (
    voucher_id INT AUTO_INCREMENT PRIMARY KEY,
    merchant_id INT NULL,
    voucher_code VARCHAR(50) NOT NULL UNIQUE,
    voucher_type ENUM('merchant', 'platform') NOT NULL,
    campaign_name VARCHAR(150),
    discount_type ENUM('percent', 'fixed_amount') NOT NULL,
    discount_value DECIMAL(10,2) NOT NULL,
    min_spend DECIMAL(10,2),
    usage_limit INT,
    usage_per_customer INT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (merchant_id) REFERENCES merchant(merchant_id)
);

CREATE TABLE IF NOT EXISTS promotion (
    promo_id INT AUTO_INCREMENT PRIMARY KEY,
    merchant_id INT NOT NULL,
    voucher_id INT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    image_path VARCHAR(255),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (merchant_id) REFERENCES merchant(merchant_id),
    FOREIGN KEY (voucher_id) REFERENCES voucher(voucher_id)
);

CREATE TABLE IF NOT EXISTS featured_listing (
    listing_id INT AUTO_INCREMENT PRIMARY KEY,
    merchant_id INT NOT NULL,
    promo_id INT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    image_path VARCHAR(255),
    display_order INT DEFAULT 0,
    is_visible BOOLEAN DEFAULT TRUE,
    start_date DATE,
    end_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (merchant_id) REFERENCES merchant(merchant_id),
    FOREIGN KEY (promo_id) REFERENCES promotion(promo_id)
);

CREATE TABLE IF NOT EXISTS booking (
    booking_id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NULL,
    guest_name VARCHAR(150) NULL,
    guest_email VARCHAR(150) NULL,
    guest_phone VARCHAR(30) NULL,
    merchant_id INT NOT NULL,
    service_id INT NOT NULL,
    staff_id INT NULL,
    slot_id INT NOT NULL UNIQUE,
    voucher_id INT NULL,
    original_booking_id INT NULL,
    booking_type ENUM('advance', 'walk_in') DEFAULT 'advance',
    source ENUM('web', 'qr', 'whatsapp') DEFAULT 'web',
    status ENUM('pending_payment', 'confirmed', 'arrived', 'completed', 'cancelled', 'payment_failed', 'no_show') DEFAULT 'pending_payment',
    checked_in_at DATETIME NULL,
    arrival_method ENUM('qr', 'manual', 'whatsapp') NULL,
    notes TEXT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES users(user_id),
    FOREIGN KEY (merchant_id) REFERENCES merchant(merchant_id),
    FOREIGN KEY (service_id) REFERENCES service(service_id),
    FOREIGN KEY (staff_id) REFERENCES staff(staff_id),
    FOREIGN KEY (slot_id) REFERENCES time_slot(slot_id),
    FOREIGN KEY (voucher_id) REFERENCES voucher(voucher_id),
    FOREIGN KEY (original_booking_id) REFERENCES booking(booking_id)
);

CREATE TABLE IF NOT EXISTS payment (
    payment_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL UNIQUE,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'sgd',
    payment_method ENUM('stripe', 'paypal', 'paynow', 'cash', 'wallet') NOT NULL,
    payment_status ENUM('pending', 'paid', 'failed', 'refunded', 'partially_refunded') DEFAULT 'pending',
    transaction_ref VARCHAR(255),
    payment_ref VARCHAR(255),
    stripe_payment_intent_id VARCHAR(255),
    stripe_checkout_session_id VARCHAR(255),
    stripe_latest_charge_id VARCHAR(255),
    stripe_balance_transaction_id VARCHAR(255),
    stripe_status VARCHAR(64),
    receipt_url VARCHAR(512),
    platform_hold_status ENUM('held', 'released_to_merchant', 'refunded') DEFAULT 'held',
    merchant_payout_status ENUM('pending', 'paid', 'failed') DEFAULT 'pending',
    merchant_payout_at DATETIME NULL,
    refund_amount DECIMAL(10,2),
    refund_status ENUM('none', 'pending', 'refunded', 'failed') DEFAULT 'none',
    paid_at DATETIME,
    refunded_at DATETIME,
    FOREIGN KEY (booking_id) REFERENCES booking(booking_id)
);

CREATE TABLE IF NOT EXISTS voucher_redemption (
    redemption_id INT AUTO_INCREMENT PRIMARY KEY,
    voucher_id INT NOT NULL,
    customer_id INT NOT NULL,
    booking_id INT NOT NULL UNIQUE,
    discount_amount DECIMAL(10,2) NOT NULL,
    redeemed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (voucher_id) REFERENCES voucher(voucher_id),
    FOREIGN KEY (customer_id) REFERENCES users(user_id),
    FOREIGN KEY (booking_id) REFERENCES booking(booking_id)
);

CREATE TABLE IF NOT EXISTS loyalty_wallet (
    wallet_id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL UNIQUE,
    points_balance INT DEFAULT 0,
    cashback_balance DECIMAL(10,2) DEFAULT 0.00,
    lifetime_points_earned INT DEFAULT 0,
    lifetime_points_redeemed INT DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS loyalty_transaction (
    loyalty_transaction_id INT AUTO_INCREMENT PRIMARY KEY,
    wallet_id INT NOT NULL,
    booking_id INT NULL,
    transaction_type ENUM('earn_points', 'redeem_points', 'earn_cashback', 'use_cashback', 'refund_cashback') NOT NULL,
    points_amount INT,
    cashback_amount DECIMAL(10,2),
    description VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_loyalty_booking_transaction (booking_id, transaction_type),
    FOREIGN KEY (wallet_id) REFERENCES loyalty_wallet(wallet_id),
    FOREIGN KEY (booking_id) REFERENCES booking(booking_id)
);

CREATE TABLE IF NOT EXISTS notification (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    user_id INT NOT NULL,
    merchant_id INT NOT NULL,
    notification_type ENUM('confirmation', 'reminder_24h', 'cancellation', 'reschedule', 'payment_receipt') NOT NULL,
    channel ENUM('email', 'whatsapp') NOT NULL,
    message TEXT NOT NULL,
    status ENUM('pending', 'sent', 'failed') DEFAULT 'pending',
    scheduled_at DATETIME,
    sent_at DATETIME,
    FOREIGN KEY (booking_id) REFERENCES booking(booking_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (merchant_id) REFERENCES merchant(merchant_id)
);

CREATE TABLE IF NOT EXISTS whatsapp_session (
    session_id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NULL,
    phone VARCHAR(20) NOT NULL,
    merchant_id INT NULL,
    session_state VARCHAR(100),
    temp_data JSON,
    status ENUM('active', 'completed', 'abandoned') DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES users(user_id),
    FOREIGN KEY (merchant_id) REFERENCES merchant(merchant_id)
);

CREATE TABLE IF NOT EXISTS whatsapp_message (
    message_id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    booking_id INT NULL,
    direction ENUM('inbound', 'outbound') NOT NULL,
    message_type ENUM('enquiry', 'booking', 'confirmation', 'reminder', 'cancellation', 'reschedule') NOT NULL,
    message_content TEXT NOT NULL,
    status ENUM('sent', 'received', 'failed') DEFAULT 'sent',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES whatsapp_session(session_id),
    FOREIGN KEY (booking_id) REFERENCES booking(booking_id)
);

CREATE TABLE IF NOT EXISTS validation_log (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    booking_id INT NULL,
    module VARCHAR(100) NOT NULL,
    error_type VARCHAR(100) NOT NULL,
    error_message TEXT NOT NULL,
    is_resolved BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (booking_id) REFERENCES booking(booking_id)
);

CREATE TABLE IF NOT EXISTS admin_action_log (
    admin_log_id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,
    action_type VARCHAR(100) NOT NULL,
    target_table VARCHAR(100),
    target_id INT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS favourite (
    favourite_id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    merchant_id INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (customer_id, merchant_id),
    FOREIGN KEY (customer_id) REFERENCES users(user_id),
    FOREIGN KEY (merchant_id) REFERENCES merchant(merchant_id)
);

CREATE TABLE IF NOT EXISTS merchant_review (
    review_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL UNIQUE,
    customer_id INT NOT NULL,
    merchant_id INT NOT NULL,
    service_id INT NOT NULL,
    staff_id INT NULL,
    rating INT NOT NULL,
    review_text TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES booking(booking_id),
    FOREIGN KEY (customer_id) REFERENCES users(user_id),
    FOREIGN KEY (merchant_id) REFERENCES merchant(merchant_id),
    FOREIGN KEY (service_id) REFERENCES service(service_id),
    FOREIGN KEY (staff_id) REFERENCES staff(staff_id),
    CHECK (rating BETWEEN 1 AND 5)
);

CREATE TABLE IF NOT EXISTS platform_feedback (
    feedback_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NULL UNIQUE,
    customer_id INT NOT NULL,
    rating INT NOT NULL,
    feedback_type ENUM('booking_experience', 'payment', 'qr_checkin', 'whatsapp', 'general') DEFAULT 'general',
    feedback_text TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES booking(booking_id),
    FOREIGN KEY (customer_id) REFERENCES users(user_id),
    CHECK (rating BETWEEN 1 AND 5)
);

CREATE TABLE IF NOT EXISTS customer_activity (
    activity_id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    merchant_id INT NULL,
    service_id INT NULL,
    promo_id INT NULL,
    activity_type ENUM('view_merchant','view_service','search','favourite','click_promo','booking') NOT NULL,
    activity_value VARCHAR(255) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES users(user_id),
    FOREIGN KEY (merchant_id) REFERENCES merchant(merchant_id),
    FOREIGN KEY (service_id) REFERENCES service(service_id),
    FOREIGN KEY (promo_id) REFERENCES promotion(promo_id)
);

-- =============================================================
-- STEP 3: Migrate data from old database
-- =============================================================

-- ── users ─────────────────────────────────────────────────────
-- Added: status (default 'active')
INSERT IGNORE INTO `SOI-2026-2610-0035-mizyana`.users
    (user_id, full_name, email, phone, password_hash, role, status, created_at)
SELECT
    user_id, full_name, email, phone, password_hash, role, 'active', created_at
FROM `SOI-2026-0052-mizyana`.USERS;

-- ── merchant ──────────────────────────────────────────────────
-- Changed: phone → contact_no
-- Added:   description (NULL), category (NULL), is_active (TRUE)
INSERT IGNORE INTO `SOI-2026-2610-0035-mizyana`.merchant
    (merchant_id, user_id, merchant_name, email, description, category, address, contact_no, is_featured, is_active, created_at)
SELECT
    merchant_id, user_id, merchant_name, email, NULL, NULL, address, phone, is_featured, TRUE, created_at
FROM `SOI-2026-0052-mizyana`.MERCHANT;

-- ── service ───────────────────────────────────────────────────
INSERT IGNORE INTO `SOI-2026-2610-0035-mizyana`.service
    (service_id, merchant_id, service_name, description, price, duration_mins, is_active)
SELECT
    service_id, merchant_id, service_name, description, price, duration_mins, is_active
FROM `SOI-2026-0052-mizyana`.SERVICE;

-- ── time_slot ─────────────────────────────────────────────────
-- Changed: slot_time → start_time; end_time calculated from service duration
-- Added:   staff_id (NULL)
INSERT IGNORE INTO `SOI-2026-2610-0035-mizyana`.time_slot
    (slot_id, merchant_id, service_id, staff_id, slot_date, start_time, end_time, is_available)
SELECT
    ts.slot_id,
    ts.merchant_id,
    ts.service_id,
    NULL,
    ts.slot_date,
    ts.slot_time,
    ADDTIME(ts.slot_time, SEC_TO_TIME(s.duration_mins * 60)),
    ts.is_available
FROM `SOI-2026-0052-mizyana`.TIME_SLOT ts
JOIN `SOI-2026-0052-mizyana`.SERVICE s ON s.service_id = ts.service_id;

-- ── qr_code ───────────────────────────────────────────────────
-- Added: qr_url (derived from token), qr_type (default 'general')
INSERT IGNORE INTO `SOI-2026-2610-0035-mizyana`.qr_code
    (qr_id, merchant_id, qr_token, qr_url, qr_image_path, qr_type, is_active, generated_at)
SELECT
    qr_id, merchant_id, qr_token,
    CONCAT('/booking/', qr_token),
    qr_image_path, 'general', is_active, generated_at
FROM `SOI-2026-0052-mizyana`.QR_CODE;

-- ── promotion ─────────────────────────────────────────────────
-- Removed: discount_pct (now lives in voucher — create vouchers separately if needed)
-- Added:   voucher_id (NULL), image_path (NULL)
INSERT IGNORE INTO `SOI-2026-2610-0035-mizyana`.promotion
    (promo_id, merchant_id, voucher_id, title, description, image_path, start_date, end_date, is_active)
SELECT
    promo_id, merchant_id, NULL, title, description, NULL, start_date, end_date, is_active
FROM `SOI-2026-0052-mizyana`.PROMOTION;

-- ── featured_listing ─────────────────────────────────────────
-- Added: display_order (0), start_date (NULL), end_date (NULL)
INSERT IGNORE INTO `SOI-2026-2610-0035-mizyana`.featured_listing
    (listing_id, merchant_id, promo_id, title, description, image_path, display_order, is_visible, start_date, end_date, created_at)
SELECT
    listing_id, merchant_id, promo_id, title, description, image_path, 0, is_visible, NULL, NULL, created_at
FROM `SOI-2026-0052-mizyana`.FEATURED_LISTING;

-- ── booking + time_slot (for existing bookings) ───────────────
-- Old booking had booking_date + booking_time (no slot FK).
-- New booking requires slot_id (NOT NULL UNIQUE).
-- Strategy: create a new time_slot row for each old booking, then link it.

-- 1. Insert a time_slot record for each old booking (is_available=FALSE = already taken)
INSERT INTO `SOI-2026-2610-0035-mizyana`.time_slot
    (merchant_id, service_id, staff_id, slot_date, start_time, end_time, is_available)
SELECT
    b.merchant_id,
    b.service_id,
    NULL,
    b.booking_date,
    b.booking_time,
    ADDTIME(b.booking_time, SEC_TO_TIME(s.duration_mins * 60)),
    FALSE
FROM `SOI-2026-0052-mizyana`.BOOKING b
JOIN `SOI-2026-0052-mizyana`.SERVICE s ON s.service_id = b.service_id;

-- 2. Migrate bookings — find each matching slot by (merchant, service, date, start_time)
--    source mapping:  qr_scan → qr | portal → web | others unchanged
--    status mapping:  pending → pending_payment | others unchanged
INSERT IGNORE INTO `SOI-2026-2610-0035-mizyana`.booking
    (booking_id, customer_id, merchant_id, service_id, staff_id, slot_id,
     voucher_id, original_booking_id, booking_type, source, status,
     checked_in_at, arrival_method, notes, total_amount, created_at)
SELECT
    b.booking_id,
    b.customer_id,
    b.merchant_id,
    b.service_id,
    NULL,
    ts.slot_id,
    NULL, NULL,
    'advance',
    CASE b.source
        WHEN 'qr_scan' THEN 'qr'
        WHEN 'portal'  THEN 'web'
        ELSE b.source
    END,
    CASE b.status
        WHEN 'pending' THEN 'pending_payment'
        ELSE b.status
    END,
    NULL, NULL, NULL,
    COALESCE(p.amount, s.price),
    b.created_at
FROM `SOI-2026-0052-mizyana`.BOOKING b
JOIN `SOI-2026-0052-mizyana`.SERVICE s ON s.service_id = b.service_id
LEFT JOIN `SOI-2026-0052-mizyana`.PAYMENT p ON p.booking_id = b.booking_id
JOIN `SOI-2026-2610-0035-mizyana`.time_slot ts
    ON  ts.merchant_id  = b.merchant_id
    AND ts.service_id   = b.service_id
    AND ts.slot_date    = b.booking_date
    AND ts.start_time   = b.booking_time
    AND ts.is_available = FALSE
    AND ts.staff_id     IS NULL;

-- ── payment ───────────────────────────────────────────────────
-- status mapping: success → paid | others unchanged
-- Removed: commission_pct, uniday_share, merchant_share
-- New nullable fields default to NULL/'none'/'pending'
INSERT IGNORE INTO `SOI-2026-2610-0035-mizyana`.payment
    (payment_id, booking_id, amount, payment_method, payment_status,
     transaction_ref, platform_hold_status, merchant_payout_status,
     merchant_payout_at, refund_amount, refund_status, paid_at, refunded_at)
SELECT
    payment_id, booking_id, amount, payment_method,
    CASE payment_status WHEN 'success' THEN 'paid' ELSE payment_status END,
    transaction_ref,
    'held', 'pending', NULL, NULL, 'none',
    paid_at, NULL
FROM `SOI-2026-0052-mizyana`.PAYMENT;

-- ── notification ──────────────────────────────────────────────
-- New schema requires booking_id NOT NULL and merchant_id.
-- Only migrate notifications that have a booking (others are dropped).
-- notification_type defaults to 'confirmation'; status derived from is_sent.
INSERT IGNORE INTO `SOI-2026-2610-0035-mizyana`.notification
    (notification_id, booking_id, user_id, merchant_id, notification_type,
     channel, message, status, scheduled_at, sent_at)
SELECT
    n.notification_id,
    n.booking_id,
    n.user_id,
    b.merchant_id,
    'confirmation',
    n.channel,
    n.message,
    CASE n.is_sent WHEN 1 THEN 'sent' ELSE 'pending' END,
    NULL,
    n.sent_at
FROM `SOI-2026-0052-mizyana`.NOTIFICATION n
JOIN `SOI-2026-0052-mizyana`.BOOKING b ON b.booking_id = n.booking_id;

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================
-- Done. Update config/db.js DB_NAME to SOI-2026-2610-0035-mizyana
-- =============================================================
