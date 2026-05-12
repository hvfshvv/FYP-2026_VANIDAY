const featuredListingModel = require('../models/featuredListingModel');
const promotionModel = require('../models/promotionModel');
const merchantModel = require('../models/merchantModel');

async function showHome(req, res) {
  try {
    const [featured, promotions] = await Promise.all([
      featuredListingModel.getFeaturedListings(),
      promotionModel.getActivePromotions(),
    ]);

    res.render('index', {
      title: 'Uniday — Beauty & Wellness Marketplace',
      featured,
      promotions
    });
  } catch (err) {
    console.error(err);
    res.render('index', {
      title: 'Uniday',
      featured: [],
      promotions: []
    });
  }
}

async function showMarketplace(req, res) {
  try {
    const [featured, promotions, merchants] = await Promise.all([
      featuredListingModel.getFeaturedListings(),
      promotionModel.getActivePromotions(),
      merchantModel.getAllActiveMerchants()
    ]);

    res.render('marketplace/index', {
      title: 'Marketplace',
      featured,
      promotions,
      merchants
    });
  } catch (err) {
    console.error(err);
    res.render('marketplace/index', {
      title: 'Marketplace',
      featured: [],
      promotions: [],
      merchants: []
    });
  }
}

async function showMerchantDetails(req, res) {
  try {
    const merchantId = req.params.id;

    const merchant = await merchantModel.getMerchantById(merchantId);

    if (!merchant) {
      return res.status(404).render('404', { title: 'Merchant Not Found' });
    }

    const services = await merchantModel.getMerchantServices(merchantId);

    res.render('marketplace/merchantDetails', {
      title: merchant.merchant_name,
      merchant,
      services
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading merchant details');
  }
}

module.exports = { showHome, showMarketplace, showMerchantDetails };