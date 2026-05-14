const express = require('express');
const router = express.Router();
const { requireLogin, requireAdmin } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

router.use(requireLogin, requireAdmin);

router.get('/dashboard', adminController.showDashboard);

module.exports = router;
