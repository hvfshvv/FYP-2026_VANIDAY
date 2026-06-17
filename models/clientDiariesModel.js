const reviewModel = require('./reviewModel');

async function getPhotoReviewPosts({ category = null, limit = null } = {}) {
  return reviewModel.getPhotoReviews({ category, limit });
}

async function getAvailableCategories() {
  return reviewModel.getPhotoReviewCategories();
}

async function getPostImage(reviewId) {
  const image = await reviewModel.getReviewImage(reviewId);
  if (!image) return null;

  return {
    image_data: image.review_image_data,
    image_mime: image.review_image_mime,
  };
}

module.exports = {
  getPhotoReviewPosts,
  getAvailableCategories,
  getPostImage,
};
