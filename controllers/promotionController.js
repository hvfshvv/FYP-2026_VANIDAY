const promotionModel = require('../models/promotionModel');
const serviceModel = require('../models/serviceModel');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'public', 'images', 'promotions');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, `promotion-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)) {
      return cb(new Error('Only image files are allowed.'));
    }
    cb(null, true);
  },
});

function normalizePromotionForm(body) {
  return {
    title: String(body.title || '').trim(),
    description: String(body.description || '').trim(),
    discountPct: Number(body.discount_pct || 0),
    offerText: String(body.offer_text || '').trim(),
    serviceId: body.service_id ? Number(body.service_id) : null,
    startDate: body.start_date,
    endDate: body.end_date,
  };
}

function validatePromotionForm(form) {
  if (!form.title) throw new Error('Promotion title is required.');
  if (!form.offerText) throw new Error('Offer text is required.');
  if (!form.discountPct || form.discountPct <= 0 || form.discountPct > 100) {
    throw new Error('Discount percentage must be between 1 and 100.');
  }
  if (!form.startDate || !form.endDate) throw new Error('Start and end dates are required.');
  if (new Date(form.endDate) < new Date(form.startDate)) {
    throw new Error('End date cannot be before start date.');
  }
}

async function renderPromotionsPage(req, res, {
  error = null,
  success = null,
  form = {},
} = {}) {
  const merchantId = req.session.user.merchant_id;
  const [promotions, services] = await Promise.all([
    promotionModel.getMerchantPromotions(merchantId).catch(() => []),
    serviceModel.getServicesByMerchant(merchantId).catch(() => []),
  ]);

  res.render('merchant/promotions', {
    title: 'My Promotions',
    promotions,
    services,
    form,
    error,
    success,
  });
}

async function showPromotions(req, res) {
  try {
    await renderPromotionsPage(req, res, {
      success: req.query.success ? 'Promotion request submitted for admin approval.' : null,
    });
  } catch (err) {
    console.error(err);
    res.render('merchant/promotions', {
      title: 'My Promotions',
      promotions: [],
      services: [],
      form: {},
      error: 'Failed to load promotions.',
      success: null,
    });
  }
}

async function createPromotion(req, res) {
  const merchantId = req.session.user.merchant_id;
  const form = normalizePromotionForm(req.body);

  try {
    validatePromotionForm(form);

    if (form.serviceId) {
      const services = await serviceModel.getServicesByMerchant(merchantId);
      const ownsService = services.some(service => String(service.service_id) === String(form.serviceId));
      if (!ownsService) throw new Error('Selected service does not belong to this merchant.');
    }

    const imagePath = req.file ? `/images/promotions/${req.file.filename}` : null;

    await promotionModel.createPromotion({
      merchantId,
      serviceId: form.serviceId,
      title: form.title,
      description: form.description,
      discountPct: form.discountPct,
      offerText: form.offerText,
      imagePath,
      startDate: form.startDate,
      endDate: form.endDate,
    });

    res.redirect('/merchant/promotions?success=1');
  } catch (err) {
    console.error(err);
    await renderPromotionsPage(req, res, {
      error: err.message || 'Failed to submit promotion request.',
      form: req.body,
    });
  }
}

async function togglePromotion(req, res) {
  const merchantId = req.session.user.merchant_id;
  const { promoId } = req.params;
  await promotionModel.togglePromotion(promoId, merchantId).catch(console.error);
  res.redirect('/merchant/promotions');
}

async function deletePromotion(req, res) {
  const merchantId = req.session.user.merchant_id;
  const { promoId } = req.params;
  await promotionModel.deletePromotion(promoId, merchantId).catch(console.error);
  res.redirect('/merchant/promotions');
}

module.exports = { showPromotions, createPromotion, togglePromotion, deletePromotion, upload };
