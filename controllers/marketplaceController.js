const featuredListingModel = require('../models/featuredListingModel');
const promotionModel = require('../models/promotionModel');
const merchantModel = require('../models/merchantModel');
const favouriteModel = require('../models/favouriteModel');
const { SERVICE_CATEGORIES, normalizeServiceCategory } = require('../utils/serviceCategories');

function getSelectedCategory(req) {
  return normalizeServiceCategory(req.query.category);
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

    res.render('index', {
      title: selectedCategory
        ? `${selectedCategory} Marketplace`
        : 'Uniday Beauty & Wellness Marketplace',

      featured,
      promotions,
      merchants,
      selectedCategory,
      categories: SERVICE_CATEGORIES,
      favouriteMerchantIds
    });

  } catch (err) {
    console.error(err);

    res.render('index', {
      title: 'Uniday Beauty & Wellness Marketplace',
      featured: [],
      promotions: [],
      merchants: [],
      selectedCategory: null,
      categories: SERVICE_CATEGORIES,
      favouriteMerchantIds: []
    });
  }
}

function redirectMarketplaceHome(req, res) {
  const query = req.originalUrl.includes('?')
    ? req.originalUrl.slice(req.originalUrl.indexOf('?'))
    : '';

  res.redirect(`/${query}`);
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

    let favouriteServiceIds = [];

    if (req.session.user && req.session.user.role === 'customer') {
      favouriteServiceIds =
        await favouriteModel.getFavouriteServiceIds(
          req.session.user.customer_id,
          merchantId
        );
    }

    const [merchantServices, merchantPromotions] = await Promise.all([
      merchantModel.getMerchantServices(merchantId),
      promotionModel.getMerchantApprovedPromotions(merchantId),
    ]);
    const services = merchantServices.map(service => ({
      ...service,
      category: normalizeServiceCategory(service.category) || service.category,
    }));
    const selectedServiceCategory = getSelectedCategory(req);
    const serviceCategories = [...new Set(
      services
        .map(service => normalizeServiceCategory(service.category))
        .filter(Boolean)
    )];

    res.render('marketplace/merchantDetails', {
      title: merchant.merchant_name,
      merchant,
      services,
      merchantPromotions,
      serviceCategories,
      selectedServiceCategory,
      favouriteServiceIds
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading merchant details');
  }
}

module.exports = {
  showHome,
  redirectMarketplaceHome,
  showMarketplace,
  showMerchantDetails
};
