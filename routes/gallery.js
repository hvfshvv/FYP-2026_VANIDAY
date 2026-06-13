const express = require('express');
const router = express.Router();
const galleryController = require('../controllers/galleryController');
const { requireLogin } = require('../middleware/auth');

function requireCustomer(req, res, next) {
  if (req.session.user?.role === 'customer') return next();
  res.status(403).send('Access denied. Customer account required.');
}

router.get('/', galleryController.showGallery);
router.get('/images/:postId', galleryController.showPostImage);
router.get('/saved', requireLogin, requireCustomer, galleryController.showSaved);
router.get('/create/:bookingId', requireLogin, requireCustomer, galleryController.showCreatePost);
router.post('/create/:bookingId', requireLogin, requireCustomer, galleryController.handleGalleryUpload, galleryController.createPost);
router.post('/:postId/like', requireLogin, requireCustomer, galleryController.likePost);
router.post('/:postId/unlike', requireLogin, requireCustomer, galleryController.unlikePost);
router.post('/:postId/save', requireLogin, requireCustomer, galleryController.savePost);
router.post('/:postId/unsave', requireLogin, requireCustomer, galleryController.unsavePost);
router.post('/:postId/report', requireLogin, requireCustomer, galleryController.reportPost);
router.post('/:postId/delete', requireLogin, requireCustomer, galleryController.deleteCustomerPost);

module.exports = router;
