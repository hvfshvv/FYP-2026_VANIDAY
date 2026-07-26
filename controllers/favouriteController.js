const favouriteModel = require('../models/favouriteModel');
const { SERVICE_CATEGORIES, normalizeServiceCategory } = require('../utils/serviceCategories');
const { wantsJson } = require('../middleware/auth');

function currentCustomerId(req) {
  return req.session.user.customer_id || req.session.user.user_id;
}

function sendFavouriteResult(req, res, result) {
  if (wantsJson(req)) {
    return res.json({
      success: true,
      ...result
    });
  }

  return res.redirect('back');
}

function sendFavouriteError(req, res, message) {
  if (wantsJson(req)) {
    return res.status(500).json({
      success: false,
      error: message
    });
  }

  return res.status(500).send(message);
}

// Adds the selected merchant for the current customer, then returns to the same page.
async function addMerchantFavourite(req, res) {
  try {
    const customerId = currentCustomerId(req);
    const merchantId = req.params.id;

    await favouriteModel.addMerchantFavourite(
      customerId,
      merchantId
    );

    return sendFavouriteResult(req, res, {
      favourited: true,
      addUrl: `/favourite/merchant/${merchantId}`,
      removeUrl: `/favourite/merchant/remove/${merchantId}`
    });

  } catch (err) {
    console.error(err);
    return sendFavouriteError(req, res, 'Failed to add favourite');
  }
}

// Removes the selected merchant favourite for the current customer.
async function removeMerchantFavourite(req, res) {
  try {
    const customerId = currentCustomerId(req);
    const merchantId = req.params.id;

    await favouriteModel.removeMerchantFavourite(
      customerId,
      merchantId
    );

    return sendFavouriteResult(req, res, {
      favourited: false,
      addUrl: `/favourite/merchant/${merchantId}`,
      removeUrl: `/favourite/merchant/remove/${merchantId}`
    });

  } catch (err) {
    console.error(err);
    return sendFavouriteError(req, res, 'Failed to remove favourite');
  }
}

// Loads both favourite merchants and favourite services for the customer.
async function showFavourites(req, res) {
  try {
    const customerId = currentCustomerId(req);
    const selectedCategory = normalizeServiceCategory(req.query.category);

    const merchants = await favouriteModel.getFavouriteMerchants(customerId);
    const services = await favouriteModel.getFavouriteServices(
      customerId,
      selectedCategory
    );

    res.render('customer/favourites', {
      title: 'My Favourites',
      merchants,
      services,
      categories: SERVICE_CATEGORIES,
      selectedCategory
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to load favourites');
  }
}

// Saves a single service favourite. The merchant id is stored too for easy joining later.
async function addServiceFavourite(req, res) {
  try {
    const customerId = currentCustomerId(req);
    const { merchantId, serviceId } = req.body;

    await favouriteModel.addServiceFavourite(customerId, merchantId, serviceId);

    return sendFavouriteResult(req, res, {
      favourited: true,
      addUrl: '/favourite/service',
      removeUrl: `/favourite/service/remove/${serviceId}`
    });
  } catch (err) {
    console.error(err);
    return sendFavouriteError(req, res, 'Failed to add service favourite');
  }
}

// Deletes one saved service favourite by service id.
async function removeServiceFavourite(req, res) {
  try {
    const customerId = currentCustomerId(req);
    const serviceId = req.params.id;

    await favouriteModel.removeServiceFavourite(customerId, serviceId);

    return sendFavouriteResult(req, res, {
      favourited: false,
      addUrl: '/favourite/service',
      removeUrl: `/favourite/service/remove/${serviceId}`
    });
  } catch (err) {
    console.error(err);
    return sendFavouriteError(req, res, 'Failed to remove service favourite');
  }
}

module.exports = {
  addMerchantFavourite,
  removeMerchantFavourite,
  showFavourites,
  addServiceFavourite,
  removeServiceFavourite
};
