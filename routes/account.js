const express = require('express');
const accountController = require('../controllers/accountController');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

router.use(requireLogin);

router.get('/', accountController.showAccount);
router.post('/profile', accountController.updateProfile);
router.post('/password', accountController.changePassword);

module.exports = router;
