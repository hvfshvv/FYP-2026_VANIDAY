const fs = require('fs');
const path = require('path');
const multer = require('multer');
const galleryModel = require('../models/galleryModel');
const { SERVICE_CATEGORIES, normalizeServiceCategory } = require('../utils/serviceCategories');

const galleryImageDir = path.join(__dirname, '..', 'public', 'images', 'gallery');
const REPORT_REASONS = ['Inappropriate content', 'Offensive language', 'Spam', 'Irrelevant content', 'Other'];

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) return cb(new Error('Please upload a JPG, PNG, or WebP image.'));
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

function detectedImageMime(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

function customerId(req) {
  return req.session.user?.customer_id || req.session.user?.user_id || null;
}

function returnPath(req, fallback = '/gallery') {
  const requested = String(req.body.return_to || '');
  return requested.startsWith('/gallery') ? requested : fallback;
}

function withMessage(url, key, message) {
  return `${url}${url.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(message)}`;
}

function removeUploadedFile(file) {
  if (file?.path) fs.unlink(file.path, () => {});
}

function handleGalleryUpload(req, res, next) {
  upload.single('gallery_image')(req, res, err => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5MB or smaller.' : err.message || 'Could not upload image.';
    res.redirect(`/gallery/create/${req.params.bookingId}?error=${encodeURIComponent(message)}`);
  });
}

async function showGallery(req, res) {
  try {
    const availableCategoryValues = await galleryModel.getAvailableCategories();
    const categories = SERVICE_CATEGORIES.filter(category =>
      availableCategoryValues.some(value => String(value).toLowerCase() === category.toLowerCase())
    );
    const requestedCategory = normalizeServiceCategory(req.query.category);
    const selectedCategory = categories.includes(requestedCategory) ? requestedCategory : null;
    const posts = await galleryModel.getApprovedPosts({ category: selectedCategory, viewerId: customerId(req) });
    res.render('gallery/index', {
      title: 'Inspiration Gallery',
      posts,
      categories,
      selectedCategory,
      success: req.query.success,
      error: req.query.error,
      reportReasons: REPORT_REASONS,
    });
  } catch (err) {
    console.error('[gallery] Could not load feed:', err);
    res.status(500).render('gallery/index', {
      title: 'Inspiration Gallery',
      posts: [],
      categories: [],
      selectedCategory: null,
      success: null,
      error: 'Could not load the Inspiration Gallery.',
      reportReasons: REPORT_REASONS,
    });
  }
}

async function showCreatePost(req, res) {
  try {
    const booking = await galleryModel.getCompletedBookingForPost(req.params.bookingId, customerId(req));
    if (!booking) return res.redirect('/book/viewBookings?error=Only completed bookings can be shared.');
    if (booking.gallery_post_id) return res.redirect('/book/viewBookings?error=This booking has already been shared.');
    res.render('gallery/create', { title: 'Share Your Result', booking, error: req.query.error, formValues: {} });
  } catch (err) {
    console.error('[gallery] Could not load create form:', err);
    res.redirect('/book/viewBookings?error=Could not load the gallery post form.');
  }
}

async function createPost(req, res) {
  const caption = String(req.body.caption || '').trim().slice(0, 300);
  try {
    if (!req.file) throw new Error('Please choose an image to share.');
    const imageMime = detectedImageMime(req.file.buffer);
    if (!imageMime) throw new Error('The selected file is not a valid JPG, PNG, or WebP image.');
    await galleryModel.createPost({
      bookingId: req.params.bookingId,
      customerId: customerId(req),
      imageData: req.file.buffer,
      imageMime,
      caption,
    });
    res.redirect('/gallery?success=' + encodeURIComponent('Your verified service result is now live.'));
  } catch (err) {
    removeUploadedFile(req.file);
    console.error('[gallery] Could not create post:', err);
    res.redirect(`/gallery/create/${req.params.bookingId}?error=${encodeURIComponent(err.message || 'Could not create gallery post.')}`);
  }
}

async function showPostImage(req, res) {
  try {
    const image = await galleryModel.getPostImage(req.params.postId);
    if (!image) return res.status(404).send('Gallery image not found.');
    res.set('Content-Type', image.image_mime);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(image.image_data);
  } catch (err) {
    console.error('[gallery] Could not load image:', err);
    res.status(500).send('Could not load gallery image.');
  }
}

async function showSaved(req, res) {
  try {
    const posts = await galleryModel.getApprovedPosts({ viewerId: customerId(req), savedOnly: true });
    res.render('gallery/saved', { title: 'Saved Inspiration', posts, reportReasons: REPORT_REASONS });
  } catch (err) {
    console.error('[gallery] Could not load saved posts:', err);
    res.render('gallery/saved', { title: 'Saved Inspiration', posts: [], reportReasons: REPORT_REASONS });
  }
}

async function likePost(req, res) {
  await galleryModel.likePost(req.params.postId, customerId(req)).catch(err => console.error(err));
  res.redirect(returnPath(req));
}
async function unlikePost(req, res) {
  await galleryModel.unlikePost(req.params.postId, customerId(req)).catch(err => console.error(err));
  res.redirect(returnPath(req));
}
async function savePost(req, res) {
  await galleryModel.savePost(req.params.postId, customerId(req)).catch(err => console.error(err));
  res.redirect(returnPath(req));
}
async function unsavePost(req, res) {
  await galleryModel.unsavePost(req.params.postId, customerId(req)).catch(err => console.error(err));
  res.redirect(returnPath(req));
}

async function reportPost(req, res) {
  const reason = REPORT_REASONS.includes(req.body.reason) ? req.body.reason : 'Other';
  const reported = await galleryModel.reportPost(req.params.postId, customerId(req), reason).catch(() => 0);
  const message = reported ? 'Post reported for admin review.' : 'You have already reported this post.';
  res.redirect(withMessage(returnPath(req), 'success', message));
}

async function deleteCustomerPost(req, res) {
  try {
    const post = await galleryModel.deleteCustomerPost(req.params.postId, customerId(req));
    if (post?.image_path?.startsWith('/images/gallery/')) {
      fs.unlink(path.join(galleryImageDir, path.basename(post.image_path)), () => {});
    }
    const message = post ? 'Your Inspiration Gallery post was deleted.' : 'Post not found or you do not own it.';
    res.redirect(withMessage('/gallery', post ? 'success' : 'error', message));
  } catch (err) {
    console.error('[gallery] Could not delete customer post:', err);
    res.redirect(withMessage('/gallery', 'error', 'Could not delete your gallery post.'));
  }
}

async function showAdminReports(req, res) {
  try {
    const posts = await galleryModel.getReportedPosts();
    res.render('admin/gallery', { title: 'Gallery Reports', posts, success: req.query.success, error: req.query.error });
  } catch (err) {
    console.error('[gallery] Could not load admin reports:', err);
    res.render('admin/gallery', { title: 'Gallery Reports', posts: [], success: null, error: 'Could not load gallery reports.' });
  }
}

async function ignoreReports(req, res) {
  await galleryModel.dismissReports(req.params.postId).catch(err => console.error(err));
  res.redirect('/admin/gallery/reports?success=' + encodeURIComponent('Reports dismissed. The post remains visible.'));
}

async function deletePost(req, res) {
  try {
    const post = await galleryModel.deletePost(req.params.postId);
    if (post?.image_path?.startsWith('/images/gallery/')) {
      fs.unlink(path.join(galleryImageDir, path.basename(post.image_path)), () => {});
    }
    res.redirect('/admin/gallery/reports?success=' + encodeURIComponent(post ? 'Gallery post permanently deleted.' : 'Gallery post not found.'));
  } catch (err) {
    console.error('[gallery] Could not delete post:', err);
    res.redirect('/admin/gallery/reports?error=' + encodeURIComponent('Could not delete gallery post.'));
  }
}

module.exports = {
  handleGalleryUpload,
  showGallery,
  showPostImage,
  showCreatePost,
  createPost,
  showSaved,
  likePost,
  unlikePost,
  savePost,
  unsavePost,
  reportPost,
  deleteCustomerPost,
  showAdminReports,
  ignoreReports,
  deletePost,
};
