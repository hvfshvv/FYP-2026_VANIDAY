const favouriteModel = require('../models/favouriteModel');
const { SERVICE_CATEGORIES, normalizeServiceCategory } = require('../utils/serviceCategories');

function wantsJson(req) {
  return req.xhr || req.get('accept')?.includes('application/json');
}

function sendFavouriteJson(req, res, payload) {
  if (!wantsJson(req)) return false;
  res.json({ success: true, ...payload });
  return true;
}

// Adds the selected merchant for the current customer, then returns to the same page.
async function addMerchantFavourite(req, res) {
  try {
    const customerId = req.session.user.customer_id;
    const merchantId = req.params.id;

    await favouriteModel.addMerchantFavourite(
      customerId,
      merchantId
    );

    if (sendFavouriteJson(req, res, {
      type: 'merchant',
      favourited: true,
      merchantId,
      addUrl: `/favourite/merchant/${merchantId}`,
      removeUrl: `/favourite/merchant/remove/${merchantId}`,
    })) return;

    res.redirect('back');

  } catch (err) {
    console.error(err);
    if (wantsJson(req)) return res.status(500).json({ success: false, error: 'Failed to add favourite' });
    res.status(500).send('Failed to add favourite');
  }
}

// Removes the selected merchant favourite for the current customer.
async function removeMerchantFavourite(req, res) {
  try {
    const customerId = req.session.user.customer_id;
    const merchantId = req.params.id;

    await favouriteModel.removeMerchantFavourite(
      customerId,
      merchantId
    );

    if (sendFavouriteJson(req, res, {
      type: 'merchant',
      favourited: false,
      merchantId,
      addUrl: `/favourite/merchant/${merchantId}`,
      removeUrl: `/favourite/merchant/remove/${merchantId}`,
    })) return;

    res.redirect('back');

  } catch (err) {
    console.error(err);
    if (wantsJson(req)) return res.status(500).json({ success: false, error: 'Failed to remove favourite' });
    res.status(500).send('Failed to remove favourite');
  }
}

// Loads both favourite merchants and favourite services for the customer.
async function showFavourites(req, res) {
  try {
    const customerId = req.session.user.customer_id;
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
    const customerId = req.session.user.customer_id || req.session.user.user_id;
    const { merchantId, serviceId } = req.body;

    if (!merchantId || !serviceId) {
      throw new Error('Missing service favourite details.');
    }

    await favouriteModel.addServiceFavourite(customerId, merchantId, serviceId);

    if (sendFavouriteJson(req, res, {
      type: 'service',
      favourited: true,
      merchantId,
      serviceId,
      addUrl: '/favourite/service',
      removeUrl: `/favourite/service/remove/${serviceId}`,
    })) return;

    res.redirect('back');
  } catch (err) {
    console.error(err);
    if (wantsJson(req)) return res.status(500).json({ success: false, error: 'Failed to add service favourite' });
    res.status(500).send('Failed to add service favourite');
  }
}

// Deletes one saved service favourite by service id.
async function removeServiceFavourite(req, res) {
  try {
    const customerId = req.session.user.customer_id || req.session.user.user_id;
    const serviceId = req.params.id;

    if (!serviceId) {
      throw new Error('Missing service favourite details.');
    }

    await favouriteModel.removeServiceFavourite(customerId, serviceId);

    if (sendFavouriteJson(req, res, {
      type: 'service',
      favourited: false,
      serviceId,
      addUrl: '/favourite/service',
      removeUrl: `/favourite/service/remove/${serviceId}`,
    })) return;

    res.redirect('back');
  } catch (err) {
    console.error(err);
    if (wantsJson(req)) return res.status(500).json({ success: false, error: 'Failed to remove service favourite' });
    res.status(500).send('Failed to remove service favourite');
  }
}

module.exports = {
  addMerchantFavourite,
  removeMerchantFavourite,
  showFavourites,
  addServiceFavourite,
  removeServiceFavourite
};
