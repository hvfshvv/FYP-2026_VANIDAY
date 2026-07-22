const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/notificationController');
const { requireLogin } = require('../middleware/auth');

router.use(requireLogin);
router.use((req, res, next) => {
  const role = req.session.user && req.session.user.role;
  if (role === 'customer') return next();
  if (role === 'merchant') return res.redirect('/merchant/dashboard');
  if (role === 'admin') return res.redirect('/admin/dashboard');
  return res.status(403).send('Access denied. Customer account required.');
});

router.get('/', ctrl.listNotifications);
router.post('/read-all', ctrl.markAllRead);
router.post('/:notificationId/read', ctrl.markRead);

module.exports = router;
