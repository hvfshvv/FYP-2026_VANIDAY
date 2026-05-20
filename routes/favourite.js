const express = require('express');
const router = express.Router();

const favouriteController =
  require('../controllers/favouriteController');

const { requireLogin } =
  require('../middleware/auth');

// Save a merchant to the signed-in customer's favourites.
router.post(
  '/merchant/:id',
  requireLogin,
  favouriteController.addMerchantFavourite
);

// Remove a saved merchant from the customer's favourites.
router.post(
  '/merchant/remove/:id',
  requireLogin,
  favouriteController.removeMerchantFavourite
);

// Show the customer's saved merchants and services.
router.get(
  '/',
  requireLogin,
  favouriteController.showFavourites
);

// Save a specific service from a merchant page.
router.post('/service', requireLogin, favouriteController.addServiceFavourite);

// Remove a saved service from the favourites page.
router.post('/service/remove/:id', requireLogin, favouriteController.removeServiceFavourite);

module.exports = router;
