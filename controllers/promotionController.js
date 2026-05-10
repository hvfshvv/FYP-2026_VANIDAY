const promotionModel = require('../models/promotionModel');

async function showPromotions(req, res) {
  const merchantId = req.session.user.merchant_id;
  try {
    const promotions = await promotionModel.getMerchantPromotions(merchantId);
    res.render('merchant/promotions', { title: 'My Promotions', promotions, error: null, success: null });
  } catch (err) {
    console.error(err);
    res.render('merchant/promotions', { title: 'My Promotions', promotions: [], error: 'Failed to load promotions.', success: null });
  }
}

async function createPromotion(req, res) {
  const merchantId = req.session.user.merchant_id;
  const { title, description, discount_pct, start_date, end_date } = req.body;
  try {
    await promotionModel.createPromotion({ merchantId, title, description, discountPct: discount_pct, startDate: start_date, endDate: end_date });
    res.redirect('/merchant/promotions?success=1');
  } catch (err) {
    console.error(err);
    const promotions = await promotionModel.getMerchantPromotions(merchantId).catch(() => []);
    res.render('merchant/promotions', { title: 'My Promotions', promotions, error: 'Failed to create promotion.', success: null });
  }
}

async function togglePromotion(req, res) {
  const merchantId = req.session.user.merchant_id;
  const { promoId } = req.params;
  await promotionModel.togglePromotion(promoId, merchantId).catch(console.error);
  res.redirect('/merchant/promotions');
}

async function deletePromotion(req, res) {
  const merchantId = req.session.user.merchant_id;
  const { promoId } = req.params;
  await promotionModel.deletePromotion(promoId, merchantId).catch(console.error);
  res.redirect('/merchant/promotions');
}

module.exports = { showPromotions, createPromotion, togglePromotion, deletePromotion };
