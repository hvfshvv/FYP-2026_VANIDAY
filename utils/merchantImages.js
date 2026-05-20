const fs = require('fs');
const path = require('path');

const MERCHANT_IMAGE_DIR = path.join(__dirname, '..', 'public', 'images', 'merchants');
const MERCHANT_IMAGE_WEB_DIR = '/images/merchants';

const MERCHANT_IMAGE_FALLBACKS = {
  'crown & comb studio': 'Crown & Comb.png',
  'crown & comb': 'Crown & Comb.png',
  'dewy glow': 'Dewy Glow.png',
  'glam studio': 'Glam Studio.png',
  'glow skin clinic': 'Glow skin clinic.png',
  'goddess beauty bar': 'Goddess beauty Bar.png',
  'hair republic': 'Hair Republic.png',
  'luxe nail bar': 'Luxe Nail Bar.png',
  "minnie's massage": "Minnie's massage.png",
  'pretty lash studio': 'Pretty Lash Studio.png',
  'the spa sanctuary': 'The Spa Sanctuary.png',
  'velvet bloom studio': 'Velvet Bloom Studio.png',
  'zen wellness studio': 'Zen Wellness Studio.png',
};

function merchantImageExists(webPath) {
  if (!webPath || !webPath.startsWith(`${MERCHANT_IMAGE_WEB_DIR}/`)) {
    return Boolean(webPath);
  }

  const filename = decodeURIComponent(webPath.slice(MERCHANT_IMAGE_WEB_DIR.length + 1));
  return fs.existsSync(path.join(MERCHANT_IMAGE_DIR, filename));
}

function fallbackImageForName(merchantName) {
  const filename = MERCHANT_IMAGE_FALLBACKS[String(merchantName || '').trim().toLowerCase()];
  return filename ? `${MERCHANT_IMAGE_WEB_DIR}/${encodeURIComponent(filename)}` : null;
}

function resolveMerchantImagePath(merchant) {
  const imagePath = merchant && (merchant.image_path || merchant.profile_image);

  if (merchantImageExists(imagePath)) {
    return imagePath;
  }

  return fallbackImageForName(merchant && merchant.merchant_name);
}

function withResolvedMerchantImage(merchant) {
  if (!merchant) return merchant;

  const imagePath = resolveMerchantImagePath(merchant);
  return {
    ...merchant,
    image_path: imagePath,
    profile_image: imagePath,
  };
}

module.exports = {
  resolveMerchantImagePath,
  withResolvedMerchantImage,
};
