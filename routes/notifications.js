const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/notificationController');
const { requireLogin } = require('../middleware/auth');

router.use(requireLogin);
router.use((req, res, next) => {
  const role = req.session.user && req.session.user.role;
  if (role === 'customer' || role === 'merchant') return next();
  if (role === 'admin') return res.redirect('/admin/dashboard');
  return res.status(403).send('Access denied.');
});

router.get('/', ctrl.listNotifications);
router.post('/read-all', ctrl.markAllRead);
router.post('/:notificationId/read', ctrl.markRead);

module.exports = router;
