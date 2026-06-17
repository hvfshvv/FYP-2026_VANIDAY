const clientDiariesModel = require('../models/clientDiariesModel');
const { SERVICE_CATEGORIES, normalizeServiceCategory } = require('../utils/serviceCategories');

function customerId(req) {
  return req.session.user?.customer_id || req.session.user?.user_id || null;
}

async function showClientDiaries(req, res) {
  try {
    const availableCategoryValues = await clientDiariesModel.getAvailableCategories();
    const categories = SERVICE_CATEGORIES.filter(category =>
      availableCategoryValues.some(value => String(value).toLowerCase() === category.toLowerCase())
    );
    const requestedCategory = normalizeServiceCategory(req.query.category);
    const selectedCategory = categories.includes(requestedCategory) ? requestedCategory : null;
    const posts = await clientDiariesModel.getPhotoReviewPosts({ category: selectedCategory, viewerId: customerId(req) });

    res.render('clientDiaries/index', {
      title: 'Client Diaries',
      posts,
      categories,
      selectedCategory,
      success: req.query.success,
      error: req.query.error,
    });
  } catch (err) {
    console.error('[client-diaries] Could not load feed:', err);
    res.status(500).render('clientDiaries/index', {
      title: 'Client Diaries',
      posts: [],
      categories: [],
      selectedCategory: null,
      success: null,
      error: 'Could not load Client Diaries.',
    });
  }
}

async function showPostImage(req, res) {
  try {
    const image = await clientDiariesModel.getPostImage(req.params.postId);
    if (!image) return res.status(404).send('Review image not found.');
    res.set('Content-Type', image.image_mime);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(image.image_data);
  } catch (err) {
    console.error('[client-diaries] Could not load image:', err);
    res.status(500).send('Could not load review image.');
  }
}

module.exports = {
  showClientDiaries,
  showPostImage,
};
