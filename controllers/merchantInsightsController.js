const insightsModel = require('../models/merchantInsightsModel');
const {
  resolveInsightPeriod,
  buildMerchantInsights,
} = require('../services/merchantInsightsService');
const { generateMerchantActionPlan } = require('../services/geminiMerchantInsightsService');

async function loadInsights(merchantId, periodKey) {
  const period = resolveInsightPeriod(periodKey);
  const [merchant, rows, overallReview] = await Promise.all([
    insightsModel.getMerchantInsightIdentity(merchantId),
    insightsModel.getMerchantInsightRows(
      merchantId,
      period.previousStartDate,
      period.endDate
    ),
    insightsModel.getMerchantOverallRating(merchantId),
  ]);
  if (!merchant) throw new Error('Merchant account not found.');
  return { merchant, overallReview, ...buildMerchantInsights(rows, period) };
}

async function showInsights(req, res) {
  const merchantId = req.session.user.merchant_id;
  try {
    const requestedPeriod = req.query.period || req.session.merchantInsightsPeriod;
    const insights = await loadInsights(merchantId, requestedPeriod);
    req.session.merchantInsightsPeriod = insights.period.key;
    const planKey = `${merchantId}:${insights.period.key}:${insights.period.endDate}`;
    const savedPlanEntry = req.session.merchantInsightsPlans?.[planKey];
    return res.render('merchant/insights', {
      title: 'Business Insights',
      ...insights,
      savedPlan: savedPlanEntry?.plan || null,
      error: null,
    });
  } catch (err) {
    console.error('[merchantInsights] load failed:', err);
    return res.status(500).render('merchant/insights', {
      title: 'Business Insights',
      merchant: { merchant_name: req.session.user.full_name },
      period: resolveInsightPeriod(req.query.period),
      metrics: null,
      previous: null,
      recommendations: [],
      sampleSizeWarning: false,
      overallReview: { averageRating: 0, reviewCount: 0 },
      savedPlan: null,
      error: 'Business insights could not be loaded.',
    });
  }
}

async function generateActionPlan(req, res) {
  const merchantId = req.session.user.merchant_id;
  try {
    const insights = await loadInsights(merchantId, req.body.period);
    const plan = await generateMerchantActionPlan({
      merchantName: insights.merchant.merchant_name,
      period: insights.period,
      metrics: insights.metrics,
      recommendations: insights.recommendations,
    });
    const planKey = `${merchantId}:${insights.period.key}:${insights.period.endDate}`;
    req.session.merchantInsightsPeriod = insights.period.key;
    req.session.merchantInsightsPlans = req.session.merchantInsightsPlans || {};
    req.session.merchantInsightsPlans[planKey] = {
      plan,
      savedAt: Date.now(),
    };
    return res.json({ success: true, plan });
  } catch (err) {
    console.error('[merchantInsights] AI plan failed:', err);
    return res.status(503).json({
      success: false,
      message: 'AI coaching is temporarily unavailable. Your verified insights remain available below.',
    });
  }
}

module.exports = { showInsights, generateActionPlan, loadInsights };
