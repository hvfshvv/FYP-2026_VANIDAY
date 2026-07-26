const featuredListingModel = require('../models/featuredListingModel');
const promotionModel = require('../models/promotionModel');
const merchantModel = require('../models/merchantModel');
const favouriteModel = require('../models/favouriteModel');
const reviewModel = require('../models/reviewModel');
const { SERVICE_CATEGORIES, normalizeServiceCategory } = require('../utils/serviceCategories');

function getWhatsAppBookingNumber() {
  return String(process.env.TWILIO_WHATSAPP_NUMBER || '')
    .replace('whatsapp:', '')
    .replace(/\D/g, '');
}

function getSelectedCategory(req) {
  return normalizeServiceCategory(req.query.category);
}

function getSearchQuery(req) {
  return String(req.query.q || '').trim().replace(/\s+/g, ' ').slice(0, 100);
}

function currentCustomerId(req) {
  return req.session.user.customer_id || req.session.user.user_id;
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
    const searchQuery = getSearchQuery(req);

    let favouriteMerchantIds = [];

    if (req.session.user && req.session.user.role === 'customer') {
      const favourites = await favouriteModel.getFavouriteMerchants(
        currentCustomerId(req)
      );

      favouriteMerchantIds = favourites.map(f => f.merchant_id);
    }

    const [featured, promotions, merchants] = await Promise.all([
      featuredListingModel.getFeaturedListings(selectedCategory, searchQuery),
      promotionModel.getActivePromotions(selectedCategory),
      merchantModel.getAllActiveMerchants(selectedCategory, searchQuery)
    ]);

    res.render('index', {
      title: selectedCategory
        ? `${selectedCategory} Marketplace`
        : 'Uniday Beauty & Wellness Marketplace',

      featured,
      promotions,
      merchants,
      selectedCategory,
      searchQuery,
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
      searchQuery: getSearchQuery(req),
      categories: SERVICE_CATEGORIES,
      favouriteMerchantIds: []
    });
  }
}

function redirectMarketplaceHome(req, res) {
  const query = req.originalUrl.includes('?')
    ? req.originalUrl.slice(req.originalUrl.indexOf('?'))
    : '';

  res.redirect(`/${query}#marketplace`);
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
          currentCustomerId(req),
          merchantId
        );
    }

    const [merchantServices, merchantPromotions, merchantReviews, upcomingClosures] = await Promise.all([
      merchantModel.getMerchantServices(merchantId),
      promotionModel.getMerchantApprovedPromotions(merchantId),
      reviewModel.getRecentMerchantReviews(merchantId, 8),
      require('../models/bookingDisruptionModel').listClosures(merchantId).catch(() => []),
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
    const cameFromClientDiaries = req.query.from === 'client-diaries';
    const cameFromTopMerchants = req.query.from === 'top-merchants';
    const returnDiaryCategory = cameFromClientDiaries
      ? normalizeServiceCategory(req.query.returnCategory)
      : null;
    const returnDiaryPost = cameFromClientDiaries && /^\d+$/.test(String(req.query.returnPost || ''))
      ? String(req.query.returnPost)
      : null;
    const diaryQuery = returnDiaryCategory
      ? `?category=${encodeURIComponent(returnDiaryCategory)}`
      : '';
    let backHref = '/marketplace';
    let backLabel = 'Back to Marketplace';

    if (cameFromClientDiaries) {
      backHref = `/client-diaries${diaryQuery}${returnDiaryPost ? `#diary-post-${returnDiaryPost}` : ''}`;
      backLabel = 'Back to Client Diaries';
    } else if (cameFromTopMerchants) {
      backHref = '/#featured-listings';
      backLabel = 'Back to Top Merchants';
    }

    res.render('marketplace/merchantDetails', {
      title: merchant.merchant_name,
      merchant,
      services,
      merchantPromotions,
      merchantReviews,
      serviceCategories,
      selectedServiceCategory,
      favouriteServiceIds,
      whatsappBookingNumber: getWhatsAppBookingNumber(),
      upcomingClosures,
      backHref,
      backLabel,
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
