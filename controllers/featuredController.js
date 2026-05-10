const multer       = require('multer');
const path         = require('path');
const featuredModel  = require('../models/featuredListingModel');
const promotionModel = require('../models/promotionModel');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'public', 'images'),
  filename:    (req, file, cb) => cb(null, `listing_${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 } });

async function showFeaturedPage(req, res) {
  const merchantId = req.session.user.merchant_id;
  try {
    const [listing, promotions] = await Promise.all([
      featuredModel.getMerchantListing(merchantId),
      promotionModel.getMerchantPromotions(merchantId),
    ]);
    res.render('merchant/featured', { title: 'Featured Listing', listing, promotions, error: null, success: null });
  } catch (err) {
    console.error(err);
    res.render('merchant/featured', { title: 'Featured Listing', listing: null, promotions: [], error: 'Failed to load listing.', success: null });
  }
}

async function saveFeaturedListing(req, res) {
  const merchantId = req.session.user.merchant_id;
  const { title, description, promo_id } = req.body;
  const imagePath = req.file ? `/images/${req.file.filename}` : null;
  try {
    await featuredModel.upsertFeaturedListing({ merchantId, promoId: promo_id || null, title, description, imagePath });
    res.redirect('/merchant/featured?success=1');
  } catch (err) {
    console.error(err);
    res.redirect('/merchant/featured');
  }
}

async function toggleVisibility(req, res) {
  const merchantId = req.session.user.merchant_id;
  await featuredModel.toggleListingVisibility(merchantId).catch(console.error);
  res.redirect('/merchant/featured');
}

module.exports = { showFeaturedPage, saveFeaturedListing, toggleVisibility, upload };
