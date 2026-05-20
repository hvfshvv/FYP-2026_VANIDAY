const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const qrModel = require('../models/qrModel');

const QR_DIR = path.join(__dirname, '..', 'public', 'images', 'qr');

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

function buildBookingUrl(token, baseUrl) {
  return `${normalizeBaseUrl(baseUrl)}/book/${token}`;
}

function buildArrivalUrl(token, baseUrl) {
  return `${normalizeBaseUrl(baseUrl)}/book/arrival/${token}`;
}

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

async function generateUniqueToken() {
  // Generate a unique QR token so each scan link is private.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = generateToken();
    const existing = await qrModel.getQRByTokenIncludingInactive(token);

    if (!existing) return token;
  }

  throw new Error('Unable to generate a unique QR token');
}

function normalizeQRType(type) {
  return type === 'check_in' ? 'check_in' : 'booking';
}

function buildQRUrl(type, token, baseUrl) {
  return normalizeQRType(type) === 'check_in'
    ? buildArrivalUrl(token, baseUrl)
    : buildBookingUrl(token, baseUrl);
}

async function createQRForMerchant(merchantId, type = 'booking', { baseUrl, deactivateExisting = true } = {}) {
  if (!merchantId) throw new Error('merchantId is required');

  const qrType = normalizeQRType(type);

  if (deactivateExisting) {
    // Prevent duplicate active QR codes for the same merchant and QR type.
    await qrModel.deactivateMerchantQRs(merchantId, qrType);
  }

  fs.mkdirSync(QR_DIR, { recursive: true });

  // Build the scan URL and save it as a printable QR image.
  const token = await generateUniqueToken();
  const qrUrl = buildQRUrl(qrType, token, baseUrl);
  const fileName = `${merchantId}-${qrType}-${token}.png`;
  const filePath = path.join(QR_DIR, fileName);
  const imagePath = `/images/qr/${fileName}`;

  await QRCode.toFile(filePath, qrUrl, { width: 400, margin: 2 });
  await qrModel.insertQR(merchantId, token, imagePath, qrUrl, qrType);

  return qrModel.getActiveQRByMerchant(merchantId, qrType);
}

async function createBookingQRForMerchant(merchantId, options = {}) {
  return createQRForMerchant(merchantId, 'booking', options);
}

async function createArrivalQRForMerchant(merchantId, options = {}) {
  return createQRForMerchant(merchantId, 'check_in', options);
}

async function ensureBookingQRForMerchant(merchantId, options = {}) {
  const existing = await qrModel.getActiveQRByMerchant(merchantId, 'booking');
  if (existing) return existing;

  return createBookingQRForMerchant(merchantId, {
    ...options,
    deactivateExisting: false,
  });
}

async function ensureArrivalQRForMerchant(merchantId, options = {}) {
  const existing = await qrModel.getActiveQRByMerchant(merchantId, 'check_in');
  if (existing) return existing;

  return createArrivalQRForMerchant(merchantId, {
    ...options,
    deactivateExisting: false,
  });
}

async function ensureMerchantQRCodes(merchantId, options = {}) {
  // Make sure every merchant has both booking and arrival QR codes.
  const [bookingQR, arrivalQR] = await Promise.all([
    ensureBookingQRForMerchant(merchantId, options),
    ensureArrivalQRForMerchant(merchantId, options),
  ]);

  return { bookingQR, arrivalQR };
}

module.exports = {
  buildArrivalUrl,
  buildBookingUrl,
  createArrivalQRForMerchant,
  createBookingQRForMerchant,
  ensureArrivalQRForMerchant,
  ensureBookingQRForMerchant,
  ensureMerchantQRCodes,
};
