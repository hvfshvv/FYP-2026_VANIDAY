/*
 * adminCampaignController.js
 * Handles the admin campaign management section: platform voucher campaigns
 * (create, edit, toggle) and loyalty reward configurations (create, edit, toggle).
 * All campaign forms include validation helpers that throw on bad input.
 */

const voucherModel = require('../models/voucherModel');
const loyaltyModel = require('../models/loyaltyModel');
const { toDateInput } = require('./adminDashboardController');
const { generateCampaignRecommendation } = require('../services/geminiCampaignService');

// ── FORM PARSERS ───────────────────────────────────────────────────────────

// Validates and normalises the loyalty reward creation/edit form data.
function parseLoyaltyRewardForm(form) {
  const title = String(form.title || '').trim();
  const discountType = form.discount_type === 'fixed_amount' ? 'fixed_amount' : 'percent';
  const discountValue = Number(form.discount_value || 0);
  const pointsCost = Number.parseInt(form.points_cost, 10);
  const minSpend = form.min_spend ? Number(form.min_spend) : null;
  const validityMonths = form.validity_months ? Number.parseInt(form.validity_months, 10) : 3;
  const displayOrder = form.display_order ? Number.parseInt(form.display_order, 10) : 0;
  const minTier = ['Bronze', 'Silver', 'Gold', 'Platinum'].includes(form.min_tier) ? form.min_tier : 'Bronze';

  if (!title) throw new Error('Reward title is required.');
  if (!pointsCost || pointsCost <= 0) throw new Error('Points cost must be more than 0.');
  if (!discountValue || discountValue <= 0) throw new Error('Discount value must be more than 0.');
  if (discountType === 'percent' && discountValue > 100) throw new Error('Percent discount cannot be more than 100.');
  if (!validityMonths || validityMonths <= 0) throw new Error('Validity must be at least 1 month.');

  return {
    title,
    description: String(form.description || '').trim(),
    pointsCost,
    minTier,
    valueLabel: String(form.value_label || '').trim(),
    discountType,
    discountValue,
    minSpend,
    validityMonths,
    displayOrder,
  };
}

// Validates and normalises the voucher campaign creation/edit form data.
function parseCampaignForm(form) {
  const voucherCode = String(form.voucher_code || '').trim().toUpperCase();
  const voucherType = 'platform';
  const merchantId = null;
  const discountType = form.discount_type === 'fixed_amount' ? 'fixed_amount' : 'percent';
  const discountValue = Number(form.discount_value || 0);
  const minSpend = form.min_spend ? Number(form.min_spend) : null;
  const usageLimit = form.usage_limit ? Number.parseInt(form.usage_limit, 10) : null;
  const usagePerCustomer = form.usage_per_customer ? Number.parseInt(form.usage_per_customer, 10) : null;

  if (!voucherCode) throw new Error('Voucher code is required.');
  if (!form.campaign_name || !String(form.campaign_name).trim()) throw new Error('Campaign name is required.');
  if (!discountValue || discountValue <= 0) throw new Error('Discount value must be more than 0.');
  if (discountType === 'percent' && discountValue > 100) throw new Error('Percent discount cannot be more than 100.');
  if (!form.start_date || !form.end_date) throw new Error('Start and end dates are required.');
  if (new Date(form.end_date) < new Date(form.start_date)) throw new Error('End date cannot be before start date.');

  return {
    merchantId,
    voucherCode,
    voucherType,
    campaignName: String(form.campaign_name).trim(),
    discountType,
    discountValue,
    minSpend,
    usageLimit,
    usagePerCustomer,
    startDate: form.start_date,
    endDate: form.end_date,
  };
}

// Maps a DB voucher record to the form field names used by the campaign edit form.
function voucherToCampaignForm(voucher) {
  return {
    campaign_name: voucher.campaign_name || '',
    voucher_code: voucher.voucher_code || '',
    discount_type: voucher.discount_type || 'percent',
    discount_value: voucher.discount_value || '',
    min_spend: voucher.min_spend || '',
    usage_limit: voucher.usage_limit || '',
    usage_per_customer: voucher.usage_per_customer || '1',
    start_date: toDateInput(new Date(voucher.start_date)),
    end_date: toDateInput(new Date(voucher.end_date)),
  };
}

function isRealDateInput(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function parseAiRecommendationRequest(body) {
  const occasion = typeof body.occasion === 'string' ? body.occasion.trim() : '';
  const goal = typeof body.goal === 'string' ? body.goal.trim() : '';
  const eventDate = body.eventDate;

  if (!occasion || !goal || occasion.length > 100 || goal.length > 100 || !isRealDateInput(eventDate)) {
    return null;
  }

  return { occasion, eventDate, goal };
}

function parseVoucherAnalyticsFilters(query = {}) {
  const campaignId = query.campaignId ? Number.parseInt(query.campaignId, 10) : null;
  const status = ['active', 'inactive'].includes(query.status) ? query.status : '';
  const startDate = isRealDateInput(query.startDate) ? query.startDate : '';
  const endDate = isRealDateInput(query.endDate) ? query.endDate : '';

  if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
    return {
      filters: { campaignId: campaignId || '', status, startDate, endDate },
      error: 'End date cannot be before start date.',
    };
  }

  return {
    filters: {
      campaignId: campaignId || '',
      status,
      startDate,
      endDate,
    },
    error: null,
  };
}

// Re-renders the campaign form with error state, reloading needed data to populate dropdowns.
async function renderCampaignFormError(res, req, {
  title = 'Voucher & Campaign Management',
  form,
  error,
  editingCampaign = null,
}) {
  const [vouchers, merchants, voucherSummary] = await Promise.all([
    voucherModel.getVoucherCampaigns().catch(() => []),
    voucherModel.getApprovedMerchants().catch(() => []),
    voucherModel.getVoucherStatusSummary().catch(() => ({})),
  ]);

  res.render('admin/campaigns', {
    title,
    vouchers,
    merchants,
    voucherSummary,
    query: req.query,
    form,
    editingCampaign,
    error,
  });
}

// ── CAMPAIGN PAGES ─────────────────────────────────────────────────────────

// Renders the campaign management home with voucher and loyalty reward summaries.
async function showCampaigns(req, res) {
  try {
    const [voucherSummary, loyaltySummary] = await Promise.all([
      voucherModel.getVoucherStatusSummary(),
      loyaltyModel.getLoyaltyRewardSummary(),
    ]);

    res.render('admin/campaignsHome', {
      title: 'Voucher Management',
      voucherSummary,
      loyaltySummary,
      query: req.query,
    });
  } catch (err) {
    console.error(err);
    res.render('admin/campaignsHome', {
      title: 'Voucher Management',
      voucherSummary: {},
      loyaltySummary: {},
      query: req.query,
      error: 'Failed to load voucher management summary.',
    });
  }
}

// Renders the voucher campaigns list with the create form.
async function showVoucherCampaigns(req, res) {
  try {
    const [vouchers, merchants, voucherSummary] = await Promise.all([
      voucherModel.getVoucherCampaigns(),
      voucherModel.getApprovedMerchants(),
      voucherModel.getVoucherStatusSummary(),
    ]);

    res.render('admin/campaigns', {
      title: 'Voucher & Campaign Management',
      vouchers,
      merchants,
      voucherSummary,
      query: req.query,
      form: {},
      error: null,
    });
  } catch (err) {
    console.error(err);
    res.render('admin/campaigns', {
      title: 'Voucher & Campaign Management',
      vouchers: [],
      merchants: [],
      voucherSummary: {},
      query: req.query,
      form: {},
      error: 'Failed to load voucher campaigns.',
    });
  }
}

// Renders the campaign edit form pre-populated with the existing voucher data.
async function showEditCampaign(req, res) {
  try {
    const [voucher, vouchers, merchants, voucherSummary] = await Promise.all([
      voucherModel.getVoucherCampaignById(req.params.voucherId),
      voucherModel.getVoucherCampaigns(),
      voucherModel.getApprovedMerchants(),
      voucherModel.getVoucherStatusSummary(),
    ]);

    if (!voucher) {
      return res.redirect('/admin/campaigns/vouchers?error=missing');
    }

    res.render('admin/campaigns', {
      title: 'Edit Voucher Campaign',
      vouchers,
      merchants,
      voucherSummary,
      query: req.query,
      form: voucherToCampaignForm(voucher),
      editingCampaign: voucher,
      error: null,
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/campaigns/vouchers?error=edit');
  }
}

// Creates a new platform voucher campaign, re-rendering the form on validation failure.
async function createCampaign(req, res) {
  const form = req.body;

  try {
    await voucherModel.createVoucherCampaign(parseCampaignForm(form));

    res.redirect('/admin/campaigns/vouchers?created=1');
  } catch (err) {
    await renderCampaignFormError(res, req, {
      form,
      error: err.code === 'ER_DUP_ENTRY'
        ? 'That voucher code already exists. Please use another code.'
        : err.message,
    });
  }
}

// Updates an existing platform voucher campaign, re-rendering the form on validation failure.
async function updateCampaign(req, res) {
  const form = req.body;

  try {
    const affectedRows = await voucherModel.updateVoucherCampaign(
      req.params.voucherId,
      parseCampaignForm(form)
    );

    res.redirect(`/admin/campaigns/vouchers?${affectedRows ? 'saved=1' : 'error=missing'}`);
  } catch (err) {
    const editingCampaign = await voucherModel.getVoucherCampaignById(req.params.voucherId).catch(() => null);

    await renderCampaignFormError(res, req, {
      title: 'Edit Voucher Campaign',
      form,
      editingCampaign,
      error: err.code === 'ER_DUP_ENTRY'
        ? 'That voucher code already exists. Please use another code.'
        : err.message,
    });
  }
}

// Toggles the active/inactive status of a voucher campaign.
async function toggleCampaign(req, res) {
  try {
    await voucherModel.toggleVoucherStatus(req.params.voucherId);
    res.redirect('/admin/campaigns/vouchers?updated=1');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/campaigns/vouchers?error=update');
  }
}

// ── LOYALTY REWARD PAGES ───────────────────────────────────────────────────

async function generateAiRecommendation(req, res) {
  const input = parseAiRecommendationRequest(req.body || {});

  if (!input) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid occasion, event date and campaign goal.',
    });
  }

  try {
    const recommendation = await generateCampaignRecommendation(input);

    return res.status(200).json({
      success: true,
      recommendation,
    });
  } catch (err) {
    console.error('[adminCampaign] AI recommendation generation failed:', err);

    return res.status(500).json({
      success: false,
      message: 'Unable to generate a recommendation right now.',
    });
  }
}

async function showVoucherAnalytics(req, res) {
  const { filters, error: filterError } = parseVoucherAnalyticsFilters(req.query);

  try {
    const campaignOptions = await voucherModel.getVoucherCampaignFilterOptions();
    const analytics = filterError
      ? {
          summary: {
            totalCampaigns: 0,
            activeCampaigns: 0,
            inactiveCampaigns: 0,
            totalClaims: 0,
            totalUsed: 0,
            totalDiscountGiven: 0,
          },
          campaigns: [],
        }
      : await voucherModel.getVoucherAnalytics(filters);

    res.render('admin/voucherAnalytics', {
      title: 'Voucher Analytics',
      analytics,
      campaignOptions,
      filters,
      error: filterError,
    });
  } catch (err) {
    console.error('[adminCampaign] Failed to load voucher analytics:', err.message);
    res.render('admin/voucherAnalytics', {
      title: 'Voucher Analytics',
      analytics: {
        summary: {
          totalCampaigns: 0,
          activeCampaigns: 0,
          inactiveCampaigns: 0,
          totalClaims: 0,
          totalUsed: 0,
          totalDiscountGiven: 0,
        },
        campaigns: [],
      },
      campaignOptions: [],
      filters,
      error: 'Unable to load voucher analytics right now.',
    });
  }
}

// Renders the loyalty rewards list with the create form.
async function showLoyaltyRewards(req, res) {
  try {
    const [rewards, summary] = await Promise.all([
      loyaltyModel.getLoyaltyRewards({ includeInactive: true }),
      loyaltyModel.getLoyaltyRewardSummary(),
    ]);

    res.render('admin/loyaltyRewards', {
      title: 'Loyalty Vouchers Management',
      rewards,
      summary,
      query: req.query,
      form: {},
      error: null,
    });
  } catch (err) {
    console.error(err);
    res.render('admin/loyaltyRewards', {
      title: 'Loyalty Vouchers Management',
      rewards: [],
      summary: {},
      query: req.query,
      form: {},
      error: 'Failed to load loyalty vouchers.',
    });
  }
}

// Renders the loyalty reward edit form pre-populated with the existing reward data.
async function showEditLoyaltyReward(req, res) {
  try {
    const [reward, rewards, summary] = await Promise.all([
      loyaltyModel.getLoyaltyRewardById(req.params.rewardId),
      loyaltyModel.getLoyaltyRewards({ includeInactive: true }),
      loyaltyModel.getLoyaltyRewardSummary(),
    ]);

    if (!reward) {
      return res.redirect('/admin/campaigns/loyalty?error=missing');
    }

    res.render('admin/loyaltyRewards', {
      title: 'Edit Loyalty Voucher',
      rewards,
      summary,
      query: req.query,
      form: {
        title: reward.title,
        description: reward.description,
        points_cost: reward.pointsCost,
        min_tier: reward.minTier,
        value_label: reward.valueLabel,
        discount_type: reward.discountType,
        discount_value: reward.discountValue,
        min_spend: reward.minSpend || '',
        validity_months: reward.validityMonths,
        display_order: reward.displayOrder,
      },
      editingReward: reward,
      error: null,
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/campaigns/loyalty?error=edit');
  }
}

// Creates a new loyalty reward, re-rendering the form with validation errors if it fails.
async function createLoyaltyReward(req, res) {
  const form = req.body;

  try {
    await loyaltyModel.createLoyaltyReward(parseLoyaltyRewardForm(form));

    res.redirect('/admin/campaigns/loyalty?created=1');
  } catch (err) {
    const [rewards, summary] = await Promise.all([
      loyaltyModel.getLoyaltyRewards({ includeInactive: true }).catch(() => []),
      loyaltyModel.getLoyaltyRewardSummary().catch(() => ({})),
    ]);

    res.render('admin/loyaltyRewards', {
      title: 'Loyalty Vouchers Management',
      rewards,
      summary,
      query: req.query,
      form,
      error: err.message,
    });
  }
}

// Updates an existing loyalty reward, re-rendering the form with validation errors if it fails.
async function updateLoyaltyReward(req, res) {
  const form = req.body;

  try {
    const affectedRows = await loyaltyModel.updateLoyaltyReward(
      req.params.rewardId,
      parseLoyaltyRewardForm(form)
    );

    res.redirect(`/admin/campaigns/loyalty?${affectedRows ? 'saved=1' : 'error=missing'}`);
  } catch (err) {
    const [reward, rewards, summary] = await Promise.all([
      loyaltyModel.getLoyaltyRewardById(req.params.rewardId).catch(() => null),
      loyaltyModel.getLoyaltyRewards({ includeInactive: true }).catch(() => []),
      loyaltyModel.getLoyaltyRewardSummary().catch(() => ({})),
    ]);

    res.render('admin/loyaltyRewards', {
      title: 'Edit Loyalty Voucher',
      rewards,
      summary,
      query: req.query,
      form,
      editingReward: reward,
      error: err.message,
    });
  }
}

// Toggles the active/inactive status of a loyalty reward.
async function toggleLoyaltyReward(req, res) {
  try {
    await loyaltyModel.toggleLoyaltyRewardStatus(req.params.rewardId);
    res.redirect('/admin/campaigns/loyalty?updated=1');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/campaigns/loyalty?error=update');
  }
}

module.exports = {
  showCampaigns,
  showVoucherCampaigns,
  showVoucherAnalytics,
  showEditCampaign,
  createCampaign,
  updateCampaign,
  toggleCampaign,
  generateAiRecommendation,
  showLoyaltyRewards,
  showEditLoyaltyReward,
  createLoyaltyReward,
  updateLoyaltyReward,
  toggleLoyaltyReward,
};
