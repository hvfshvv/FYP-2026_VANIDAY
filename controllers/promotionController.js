const promotionModel = require('../models/promotionModel');
const serviceModel = require('../models/serviceModel');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { wantsJson } = require('../middleware/auth');
const { generatePromotionSuggestion } = require('../services/geminiPromotionService');

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

function handlePromotionUpload(req, res, next) {
  // Upload optional promotion banner image.
  upload.single('image')(req, res, err => {
    if (!err) return next();

    console.error('[promotion] Banner upload failed:', err);

    if (wantsJson(req)) {
      return res.status(400).json({
        success: false,
        error: err.message || 'Failed to upload banner image.',
      });
    }

    return renderPromotionsPage(req, res, {
      error: err.message || 'Failed to upload banner image.',
      form: req.body,
    }).catch(next);
  });
}

const DAY_OPTIONS = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
];

function normalizeApplicableDays(value) {
  // Keep only valid days selected by merchant.
  const selected = Array.isArray(value)
    ? value
    : value
      ? [value]
      : [];
  const allowed = DAY_OPTIONS.map(day => day.value);
  return selected.filter(day => allowed.includes(day));
}

function normalizePromotionForm(body) {
  // Clean merchant form values before validation.
  const applicableDays = normalizeApplicableDays(body.applicable_days);

  return {
    title: String(body.title || '').trim(),
    description: String(body.description || '').trim(),
    discountPct: Number(body.discount_pct || 0),
    minSpend: body.min_spend ? Number(body.min_spend) : null,
    offerText: String(body.offer_text || '').trim(),
    applicableDays,
    applicableDaysValue: applicableDays.join(','),
    serviceId: body.service_id ? Number(body.service_id) : null,
    startDate: body.start_date,
    endDate: body.end_date,
  };
}

function validatePromotionForm(form) {
  // Check required promotion fields before saving.
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

function normalizeAiPromotionRequest(body) {
  return {
    goal: String(body.goal || '').trim().slice(0, 240),
    season: String(body.season || '').trim().slice(0, 120),
    currentForm: {
      title: String(body.title || '').trim(),
      offerText: String(body.offer_text || '').trim(),
      description: String(body.description || '').trim(),
      serviceId: String(body.service_id || '').trim(),
      discountPct: String(body.discount_pct || '').trim(),
      minSpend: String(body.min_spend || '').trim(),
      startDate: String(body.start_date || '').trim(),
      endDate: String(body.end_date || '').trim(),
    },
  };
}

async function renderPromotionsPage(req, res, {
  error = null,
  success = null,
  form = {},
} = {}) {
  const merchantId = req.session.user.merchant_id;
  // Load merchant promotions and services for the form.
  const [promotions, services] = await Promise.all([
    promotionModel.getMerchantPromotions(merchantId).catch(() => []),
    serviceModel.getServicesByMerchant(merchantId).catch(() => []),
  ]);

  res.render('merchant/promotions', {
    title: 'My Promotions',
    promotions,
    services,
    dayOptions: DAY_OPTIONS,
    form,
    error,
    success,
  });
}

async function showPromotions(req, res) {
  try {
    const suggestedGoal = req.query.goal === 'off-peak'
      ? 'Fill quieter appointment times'
      : (req.query.goal === 'returning-customers' ? 'Encourage customers to book again' : '');
    await renderPromotionsPage(req, res, {
      success: req.query.success ? 'Promotion request submitted for admin approval.' : null,
      form: {
        service_id: req.query.serviceId || '',
        suggested_goal: suggestedGoal,
      },
    });
  } catch (err) {
    console.error(err);
    res.render('merchant/promotions', {
      title: 'My Promotions',
      promotions: [],
      services: [],
      dayOptions: DAY_OPTIONS,
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
    console.log('[promotion] Create request received', {
      merchantId,
      title: form.title,
      startDate: form.startDate,
      endDate: form.endDate,
      applicableDays: form.applicableDaysValue || 'every day',
      hasImage: Boolean(req.file),
    });

    validatePromotionForm(form);

    if (form.serviceId) {
      // Ensure merchant only promotes their own services.
      const services = await serviceModel.getServicesByMerchant(merchantId);
      const ownsService = services.some(service => String(service.service_id) === String(form.serviceId));
      if (!ownsService) throw new Error('Selected service does not belong to this merchant.');
    }

    const imagePath = req.file ? `/images/promotions/${req.file.filename}` : null;

    // Submit promotion as pending admin approval.
    const promoId = await promotionModel.createPromotion({
      merchantId,
      serviceId: form.serviceId,
      title: form.title,
      description: form.description,
      discountPct: form.discountPct,
      minSpend: form.minSpend,
      offerText: form.offerText,
      applicableDays: form.applicableDaysValue,
      imagePath,
      startDate: form.startDate,
      endDate: form.endDate,
    });

    if (wantsJson(req)) {
      return res.status(201).json({
        success: true,
        promoId,
        message: 'Promotion request submitted for admin approval.',
        redirectUrl: '/merchant/promotions?success=1',
      });
    }

    res.redirect('/merchant/promotions?success=1');
  } catch (err) {
    console.error('[promotion] Failed to submit promotion request:', err);

    if (wantsJson(req)) {
      return res.status(400).json({
        success: false,
        error: err.message || 'Failed to submit promotion request.',
      });
    }

    await renderPromotionsPage(req, res, {
      error: err.message || 'Failed to submit promotion request.',
      form: req.body,
    });
  }
}

async function generateAiPromotion(req, res) {
  const merchantId = req.session.user.merchant_id;
  const input = normalizeAiPromotionRequest(req.body || {});

  if (!input.goal && !input.season && !input.currentForm.title && !input.currentForm.offerText) {
    return res.status(400).json({
      success: false,
      error: 'Enter a goal or occasion first.',
    });
  }

  try {
    const services = await serviceModel.getServicesByMerchant(merchantId).catch(() => []);
    const suggestion = await generatePromotionSuggestion({
      merchantName: req.session.user.merchant_name || req.session.user.full_name || 'Merchant',
      services,
      goal: input.goal,
      season: input.season,
      currentForm: input.currentForm,
    });

    return res.status(200).json({
      success: true,
      suggestion,
    });
  } catch (err) {
    console.error('[promotion] AI suggestion failed:', err);
    return res.status(500).json({
      success: false,
      error: 'Unable to generate a promotion suggestion right now.',
    });
  }
}

async function togglePromotion(req, res) {
  const merchantId = req.session.user.merchant_id;
  const { promoId } = req.params;
  // Merchant can pause or activate approved promotions.
  await promotionModel.togglePromotion(promoId, merchantId).catch(console.error);
  res.redirect('/merchant/promotions');
}

async function deletePromotion(req, res) {
  const merchantId = req.session.user.merchant_id;
  const { promoId } = req.params;
  await promotionModel.deletePromotion(promoId, merchantId).catch(console.error);
  res.redirect('/merchant/promotions');
}

module.exports = {
  showPromotions,
  createPromotion,
  generateAiPromotion,
  togglePromotion,
  deletePromotion,
  upload,
  handlePromotionUpload,
};
