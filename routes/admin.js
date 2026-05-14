const express = require('express');
const router = express.Router();
const { requireLogin, requireAdmin } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

router.use(requireLogin, requireAdmin);

router.get('/dashboard', adminController.showDashboard);
router.get('/:page(customers|merchants|validation|featured|campaigns)', adminController.showComingSoon);

module.exports = router;
