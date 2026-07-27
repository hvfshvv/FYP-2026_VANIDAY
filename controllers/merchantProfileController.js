const fs = require('fs');
const path = require('path');
const multer = require('multer');
const merchantModel = require('../models/merchantModel');
const { validateUploadedImageFile } = require('../utils/imageUpload');

const merchantImageDir = path.join(__dirname, '..', 'public', 'images', 'merchants');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(merchantImageDir, { recursive: true });
    cb(null, merchantImageDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `merchant_${req.session.user.merchant_id}_${Date.now()}${ext}`);
  },
});

function imageFileFilter(req, file, cb) {
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype || '')) {
    return cb(new Error('Please upload a JPG, PNG, WebP, or GIF image.'));
  }

  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
});

function handleMarketplaceImageUpload(req, res, next) {
  upload.single('marketplace_image')(req, res, (err) => {
    if (!err) {
      try {
        validateUploadedImageFile(req.file);
        return next();
      } catch (validationErr) {
        err = validationErr;
      }
    }

    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Image must be under 2MB.'
      : err.message || 'Could not upload image.';

    return res.redirect(`/merchant/manage?imageError=${encodeURIComponent(message)}`);
  });
}

async function updateMarketplaceImage(req, res) {
  const merchantId = req.session.user.merchant_id;

  try {
    if (!req.file) {
      return res.redirect('/merchant/manage?imageError=Please choose an image to upload.');
    }

    await merchantModel.updateMerchantProfileImage(
      merchantId,
      `/images/merchants/${req.file.filename}`
    );

    res.redirect('/merchant/manage?imageSuccess=Marketplace photo updated.');
  } catch (err) {
    console.error(err);
    res.redirect('/merchant/manage?imageError=Could not update marketplace photo.');
  }
}

module.exports = {
  handleMarketplaceImageUpload,
  updateMarketplaceImage,
};
