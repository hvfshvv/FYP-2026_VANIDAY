const express = require('express');
const router = express.Router();

const favouriteController =
  require('../controllers/favouriteController');

const { requireLogin } =
  require('../middleware/auth');

router.post(
  '/merchant/:id',
  requireLogin,
  favouriteController.addMerchantFavourite
);

router.post(
  '/merchant/remove/:id',
  requireLogin,
  favouriteController.removeMerchantFavourite
);

router.get(
  '/',
  requireLogin,
  favouriteController.showFavourites
);

router.post('/service', requireLogin, favouriteController.addServiceFavourite);

router.post('/service/remove/:id', requireLogin, favouriteController.removeServiceFavourite);

module.exports = router;