const favouriteModel = require('../models/favouriteModel');
const { SERVICE_CATEGORIES, normalizeServiceCategory } = require('../utils/serviceCategories');

function currentCustomerId(req) {
  return req.session.user.customer_id || req.session.user.user_id;
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

    res.redirect('back');

  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to add favourite');
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

    res.redirect('back');

  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to remove favourite');
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

    res.redirect('back');
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to add service favourite');
  }
}

// Deletes one saved service favourite by service id.
async function removeServiceFavourite(req, res) {
  try {
    const customerId = currentCustomerId(req);
    const serviceId = req.params.id;

    await favouriteModel.removeServiceFavourite(customerId, serviceId);

    res.redirect('back');
  } catch (err) {
    console.error(err);
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
