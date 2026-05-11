const featuredListingModel = require('../models/featuredListingModel');
const promotionModel       = require('../models/promotionModel');
const featuredModel        = require('../models/featuredListingModel');

async function showHome(req, res) {
  try {
    const [featured, promotions] = await Promise.all([
      featuredListingModel.getFeaturedListings(),
      promotionModel.getActivePromotions(),
    ]);
    res.render('index', { title: 'Uniday — Beauty & Wellness Marketplace', featured, promotions });
  } catch (err) {
    console.error(err);
    res.render('index', { title: 'Uniday', featured: [], promotions: [] });
  }
}

async function showMarketplace(req, res) {
  try {
    const [featured, promotions] = await Promise.all([
      featuredModel.getFeaturedListings(),
      promotionModel.getActivePromotions(),
    ]);
    res.render('marketplace/index', { title: 'Marketplace', featured, promotions });
  } catch (err) {
    console.error(err);
    res.render('marketplace/index', { title: 'Marketplace', featured: [], promotions: [] });
  }
}

module.exports = { showHome, showMarketplace };
