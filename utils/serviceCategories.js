const SERVICE_CATEGORIES = ['Hair', 'Nails', 'Facial', 'Massage', 'Wellness', 'Body', 'Aesthetics', 'Spa'];

function normalizeServiceCategory(value) {
  const requested = String(value || '').trim();

  return SERVICE_CATEGORIES.find(
    category => category.toLowerCase() === requested.toLowerCase()
  ) || null;
}

module.exports = {
  SERVICE_CATEGORIES,
  normalizeServiceCategory,
};
