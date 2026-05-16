const featuredListingModel = require('../models/featuredListingModel');
const promotionModel = require('../models/promotionModel');
const merchantModel = require('../models/merchantModel');
const favouriteModel = require('../models/favouriteModel');

const MARKETPLACE_CATEGORIES = ['Hair', 'Nails', 'Facial', 'Massage', 'Wellness', 'Body', 'Aesthetics', 'Spa'];

function getSelectedCategory(req) {
  const requested = String(req.query.category || '').trim();

  return MARKETPLACE_CATEGORIES.find(
    category => category.toLowerCase() === requested.toLowerCase()
  ) || null;
}

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
    const selectedCategory = getSelectedCategory(req);

    let favouriteMerchantIds = [];

    if (req.session.user && req.session.user.role === 'customer') {
      const favourites = await favouriteModel.getFavouriteMerchants(
        req.session.user.customer_id
      );

      favouriteMerchantIds = favourites.map(f => f.merchant_id);
    }

    const [featured, promotions, merchants] = await Promise.all([
      featuredListingModel.getFeaturedListings(selectedCategory),
      promotionModel.getActivePromotions(selectedCategory),
      merchantModel.getAllActiveMerchants(selectedCategory)
    ]);

    res.render('marketplace/index', {
      title: selectedCategory
        ? `${selectedCategory} Marketplace`
        : 'Marketplace',

      featured,
      promotions,
      merchants,
      selectedCategory,
      categories: MARKETPLACE_CATEGORIES,
      favouriteMerchantIds
    });

  } catch (err) {
    console.error(err);

    res.render('marketplace/index', {
      title: 'Marketplace',
      featured: [],
      promotions: [],
      merchants: [],
      selectedCategory: null,
      categories: MARKETPLACE_CATEGORIES,
      favouriteMerchantIds: []
    });
  }
}

async function showMerchantDetails(req, res) {
  try {
    const merchantId = req.params.id;

    const merchant = await merchantModel.getMerchantById(merchantId);

    if (!merchant) {
      return res.status(404).render('404', {
        title: 'Merchant Not Found'
      });
    }

    const services = await merchantModel.getMerchantServices(merchantId);

    let favouriteServiceIds = [];

    if (req.session.user && req.session.user.role === 'customer') {
      favouriteServiceIds =
        await favouriteModel.getFavouriteServiceIds(
          req.session.user.customer_id,
          merchantId
        );
    }

    res.render('marketplace/merchantDetails', {
      title: merchant.merchant_name,
      merchant,
      services,
      favouriteServiceIds
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading merchant details');
  }
}

module.exports = {
  showHome,
  showMarketplace,
  showMerchantDetails
};