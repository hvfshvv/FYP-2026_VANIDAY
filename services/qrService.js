const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const qrModel = require('../models/qrModel');

const QR_DIR = path.join(__dirname, '..', 'public', 'images', 'qr');
const QR_OPTIONS = { width: 400, margin: 2 };

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

async function buildQRDataUrl(qrUrl) {
  return QRCode.toDataURL(qrUrl, QR_OPTIONS);
}

async function writeQRFileIfPossible(filePath, qrUrl) {
  try {
    fs.mkdirSync(QR_DIR, { recursive: true });
    await QRCode.toFile(filePath, qrUrl, QR_OPTIONS);
    return true;
  } catch (err) {
    // Vercel/serverless filesystems are read-only or ephemeral. The QR can
    // still render from the generated data URL attached to the record.
    console.warn('[qr] Skipping QR PNG file write:', err.message);
    return false;
  }
}

async function attachQRImageSource(qr, qrUrl) {
  qr.qr_image_src = await buildQRDataUrl(qrUrl);
  return qr;
}

async function createQRForMerchant(merchantId, type = 'booking', { baseUrl, deactivateExisting = true } = {}) {
  if (!merchantId) throw new Error('merchantId is required');

  const qrType = normalizeQRType(type);

  if (deactivateExisting) {
    // Prevent duplicate active QR codes for the same merchant and QR type.
    await qrModel.deactivateMerchantQRs(merchantId, qrType);
  }

  // Build the scan URL and save it as a printable QR image.
  const token = await generateUniqueToken();
  const qrUrl = buildQRUrl(qrType, token, baseUrl);
  const fileName = `${merchantId}-${qrType}-${token}.png`;
  const filePath = path.join(QR_DIR, fileName);
  const imagePath = `/images/qr/${fileName}`;

  const wroteFile = await writeQRFileIfPossible(filePath, qrUrl);
  await qrModel.insertQR(merchantId, token, wroteFile ? imagePath : null, qrUrl, qrType);

  const qr = await qrModel.getActiveQRByMerchant(merchantId, qrType);
  return attachQRImageSource(qr, qrUrl);
}

async function createBookingQRForMerchant(merchantId, options = {}) {
  return createQRForMerchant(merchantId, 'booking', options);
}

async function createArrivalQRForMerchant(merchantId, options = {}) {
  return createQRForMerchant(merchantId, 'check_in', options);
}

async function ensureQrImageExists(qr, options = {}) {
  if (!qr) return qr;

  const expectedQrUrl = buildQRUrl(qr.qr_type, qr.qr_token, options.baseUrl);
  const needsUrlRefresh = qr.qr_url !== expectedQrUrl;

  if (qr.qr_image_path) {
    const fileName = path.basename(qr.qr_image_path);
    const filePath = path.join(QR_DIR, fileName);

    if (!fs.existsSync(filePath) || needsUrlRefresh) {
      await writeQRFileIfPossible(filePath, expectedQrUrl);
    }
  }

  if (needsUrlRefresh) {
    await qrModel.updateQRUrl(qr.qr_id, expectedQrUrl);
    qr.qr_url = expectedQrUrl;
  }

  return attachQRImageSource(qr, expectedQrUrl);
}

async function ensureBookingQRForMerchant(merchantId, options = {}) {
  const existing = await qrModel.getActiveQRByMerchant(merchantId, 'booking');
  const qr = existing || await createBookingQRForMerchant(merchantId, {
    ...options,
    deactivateExisting: false,
  });

  return ensureQrImageExists(qr, options);
}

async function ensureArrivalQRForMerchant(merchantId, options = {}) {
  const existing = await qrModel.getActiveQRByMerchant(merchantId, 'check_in');
  const qr = existing || await createArrivalQRForMerchant(merchantId, {
    ...options,
    deactivateExisting: false,
  });

  return ensureQrImageExists(qr, options);
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
