const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');

router.get('/', supportController.showSupport);
router.post('/', supportController.submitSupport);

module.exports = router;
