const favouriteModel = require('../models/favouriteModel');


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