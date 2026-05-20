const favouriteModel = require('../models/favouriteModel');


// Adds the selected merchant for the current customer, then returns to the same page.
async function addMerchantFavourite(req, res) {
  try {
    const customerId = req.session.user.customer_id;
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
    const customerId = req.session.user.customer_id;
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

// Category buttons shown on the favourites page for filtering saved services.
const CATEGORIES = [
  'Hair',
  'Nails',
  'Facial',
  'Massage',
  'Wellness',
  'Body',
  'Aesthetics',
  'Spa'
];

// Loads both favourite merchants and favourite services for the customer.
async function showFavourites(req, res) {
  try {
    const customerId = req.session.user.customer_id;
    const selectedCategory = req.query.category || null;

    const merchants = await favouriteModel.getFavouriteMerchants(customerId);
    const services = await favouriteModel.getFavouriteServices(
      customerId,
      selectedCategory
    );

    res.render('customer/favourites', {
      title: 'My Favourites',
      merchants,
      services,
      categories: CATEGORIES,
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
    const customerId = req.session.user.customer_id;
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
    const customerId = req.session.user.customer_id;
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
