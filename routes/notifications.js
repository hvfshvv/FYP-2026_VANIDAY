const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/notificationController');
const { requireLogin } = require('../middleware/auth');

router.use(requireLogin);

router.get('/', ctrl.listNotifications);
router.post('/read-all', ctrl.markAllRead);
router.post('/:notificationId/read', ctrl.markRead);

module.exports = router;
