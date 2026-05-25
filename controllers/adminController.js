const adminModel = require('../models/adminModel');
const voucherModel = require('../models/voucherModel');
const loyaltyModel = require('../models/loyaltyModel');
const promotionModel = require('../models/promotionModel');
const whatsappNotificationService = require('../services/whatsappNotificationService');
const { wantsJson } = require('../middleware/auth');

const CUSTOMER_DISABLE_REASONS = [
  'Repeated no-shows',
  'Payment or refund abuse',
  'Suspicious account activity',
  'Verification issue',
  'Other',
];

const MERCHANT_DISABLE_REASONS = [
  'Fake business information or failed verification',
  'Repeatedly not honouring confirmed bookings',
  'Fraudulent promotions/vouchers',
  'Unsafe, abusive, or misleading service listings',
  'Serious customer complaints with evidence',
];

function requireDisableReason(status, reason, allowedReasons) {
  if (status !== 'suspended') return null;

  const safeReason = String(reason || '').trim();
  if (!allowedReasons.includes(safeReason)) {
    throw new Error('Please select a valid reason before disabling the account.');
  }

  return safeReason;
}

async function showDashboard(req, res) {
  try {
    const [summary, recentErrors] = await Promise.all([
      adminModel.getDashboardSummary(),
      adminModel.getRecentValidationErrors().catch(err => {
        console.error('Failed to load validation logs:', err.message);
        return [];
      }),
    ]);

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      summary,
      recentErrors,
    });
  } catch (err) {
    console.error(err);
    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      summary: {},
      recentErrors: [],
      error: 'Failed to load admin dashboard data.',
    });
  }
}

function showComingSoon(req, res) {
  const pages = {
    customers: 'Customer Information',
    merchants: 'Merchant Information',
    validation: 'Validation & Error Logs',
    featured: 'Featured Merchants',
    campaigns: 'Voucher & Campaign Management',
  };

  const pageKey = req.params.page;
  const pageTitle = pages[pageKey] || 'Admin Module';

  res.render('admin/comingSoon', {
    title: pageTitle,
    pageTitle,
  });
}

async function showValidationLogs(req, res) {
  const filters = {
    module: req.query.module || 'all',
    status: req.query.status || 'all',
    search: req.query.search || '',
  };

  try {
    const [logs, summary] = await Promise.all([
      adminModel.getValidationLogs(filters),
      adminModel.getValidationLogSummary(),
    ]);

    res.render('admin/validationLogs', {
      title: 'Validation & Support Logs',
      logs,
      summary,
      filters,
      query: req.query,
    });
  } catch (err) {
    console.error(err);
    res.render('admin/validationLogs', {
      title: 'Validation & Support Logs',
      logs: [],
      summary: {},
      filters,
      query: req.query,
      error: 'Failed to load validation logs.',
    });
  }
}

async function resolveValidationLog(req, res) {
  try {
    await adminModel.markValidationLogResolved(req.params.logId);
    res.redirect('/admin/validation?resolved=1');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/validation?error=resolve');
  }
}

function extractSupportPhone(log) {
  if (log.customer_phone) {
    return log.customer_phone;
  }

  const match = String(log.error_message || '').match(/^Phone:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

async function replyToWhatsAppSupport(req, res) {
  const reply = String(req.body.reply || '').trim();

  try {
    if (!reply) {
      return res.redirect('/admin/validation?error=reply');
    }

    const log = await adminModel.getValidationLogById(req.params.logId);

    if (!log || log.module !== 'whatsapp_support') {
      return res.redirect('/admin/validation?error=notfound');
    }

    const phone = extractSupportPhone(log);
    await whatsappNotificationService.sendSupportReply(phone, reply);
    await adminModel.appendValidationLogReply(
      req.params.logId,
      reply,
      req.session.user && req.session.user.full_name
    );

    res.redirect('/admin/validation?replySent=1');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/validation?error=replySend');
  }
}

async function showMerchants(req, res) {
  const today = new Date();
  const defaultStart = new Date(today);
  defaultStart.setDate(defaultStart.getDate() - 29);

  const range = {
    startDate: isDate(req.query.startDate) ? req.query.startDate : toDateInput(defaultStart),
    endDate: isDate(req.query.endDate) ? req.query.endDate : toDateInput(today),
  };

  if (new Date(range.endDate) < new Date(range.startDate)) {
    range.endDate = range.startDate;
  }

  try {
    const analytics = await adminModel.getMerchantAnalytics(range);

    res.render('admin/merchants', {
      title: 'Merchant Analytics',
      analytics,
      range,
      query: req.query,
      error: null,
    });
  } catch (err) {
    console.error(err);
    res.render('admin/merchants', {
      title: 'Merchant Analytics',
      analytics: emptyMerchantAnalytics(),
      range,
      query: req.query,
      error: 'Failed to load merchant analytics data.',
    });
  }
}

async function showCustomers(req, res) {
  const today = new Date();
  const defaultStart = new Date(today);
  defaultStart.setDate(defaultStart.getDate() - 29);

  const range = {
    startDate: isDate(req.query.startDate) ? req.query.startDate : toDateInput(defaultStart),
    endDate: isDate(req.query.endDate) ? req.query.endDate : toDateInput(today),
  };

  if (new Date(range.endDate) < new Date(range.startDate)) {
    range.endDate = range.startDate;
  }

  try {
    const analytics = await adminModel.getCustomerAnalytics(range);

    res.render('admin/customers', {
      title: 'Customer Analytics',
      analytics,
      range,
      error: null,
    });
  } catch (err) {
    console.error(err);
    res.render('admin/customers', {
      title: 'Customer Analytics',
      analytics: emptyCustomerAnalytics(),
      range,
      error: 'Failed to load customer analytics data.',
    });
  }
}

async function showRevenueReport(req, res) {
  const today = new Date();
  const defaultStart = new Date(today);
  defaultStart.setDate(defaultStart.getDate() - 29);

  const range = {
    startDate: isDate(req.query.startDate) ? req.query.startDate : toDateInput(defaultStart),
    endDate: isDate(req.query.endDate) ? req.query.endDate : toDateInput(today),
  };

  if (new Date(range.endDate) < new Date(range.startDate)) {
    range.endDate = range.startDate;
  }

  try {
    const report = await adminModel.getPlatformRevenueReport(range);

    res.render('admin/revenue', {
      title: 'Revenue Report',
      report,
      range,
      error: null,
    });
  } catch (err) {
    console.error(err);
    res.render('admin/revenue', {
      title: 'Revenue Report',
      report: emptyRevenueReport(),
      range,
      error: 'Failed to load revenue report.',
    });
  }
}

async function showPlatformFeedback(req, res) {
  const filters = {
    type: req.query.type || 'all',
    rating: req.query.rating || 'all',
    search: req.query.search || '',
  };

  try {
    const [feedback, summary] = await Promise.all([
      adminModel.getPlatformFeedback(filters),
      adminModel.getPlatformFeedbackSummary(),
    ]);

    res.render('admin/platformFeedback', {
      title: 'Uniday Feedback',
      feedback,
      summary,
      filters,
      error: null,
    });
  } catch (err) {
    console.error(err);
    res.render('admin/platformFeedback', {
      title: 'Uniday Feedback',
      feedback: [],
      summary: {},
      filters,
      error: 'Failed to load Uniday feedback.',
    });
  }
}

async function showUserManagementHome(req, res) {
  try {
    // Summary counts power the two cards on admin/userManagement.ejs.
    const summary = await adminModel.getUserManagementSummary();
    res.render('admin/userManagement', {
      title: 'User Management',
      summary,
      query: req.query,
    });
  } catch (err) {
    console.error(err);
    res.render('admin/userManagement', {
      title: 'User Management',
      summary: {},
      query: req.query,
      error: 'Failed to load user management summary.',
    });
  }
}

async function showManagedCustomers(req, res) {
  try {
    // Optional search is passed straight from the query string.
    const customers = await adminModel.getManagedCustomers(req.query.search);
    res.render('admin/userCustomers', {
      title: 'Customer Accounts',
      customers,
      search: req.query.search || '',
      query: req.query,
      disableReasons: CUSTOMER_DISABLE_REASONS,
    });
  } catch (err) {
    console.error(err);
    res.render('admin/userCustomers', {
      title: 'Customer Accounts',
      customers: [],
      search: req.query.search || '',
      query: req.query,
      disableReasons: CUSTOMER_DISABLE_REASONS,
      error: 'Failed to load customer accounts.',
    });
  }
}

async function showManagedMerchants(req, res) {
  try {
    // Only allow known verification filters before passing to the model.
    const verification = ['pending', 'approved'].includes(req.query.verification)
      ? req.query.verification
      : 'all';
    const merchants = await adminModel.getManagedMerchants(req.query.search, verification);
    res.render('admin/userMerchants', {
      title: 'Merchant Accounts',
      merchants,
      search: req.query.search || '',
      verification,
      query: req.query,
      disableReasons: MERCHANT_DISABLE_REASONS,
    });
  } catch (err) {
    console.error(err);
    res.render('admin/userMerchants', {
      title: 'Merchant Accounts',
      merchants: [],
      search: req.query.search || '',
      verification: req.query.verification || 'all',
      query: req.query,
      disableReasons: MERCHANT_DISABLE_REASONS,
      error: 'Failed to load merchant accounts.',
    });
  }
}

async function updateCustomerAccountStatus(req, res) {
  try {
    const reason = requireDisableReason(req.body.status, req.body.disable_reason, CUSTOMER_DISABLE_REASONS);
    // Admin can enable or disable a customer account from the table.
    await adminModel.setUserAccountStatus(
      req.params.customerId,
      req.body.status,
      req.session.user.user_id,
      reason
    );

    res.redirect('/admin/user-management/customers?updated=1');
  } catch (err) {
    console.error(err);
    res.redirect(`/admin/user-management/customers?error=${encodeURIComponent(err.message || 'Could not update customer account.')}`);
  }
}

async function updateMerchantAccountStatus(req, res) {
  try {
    const reason = requireDisableReason(req.body.status, req.body.disable_reason, MERCHANT_DISABLE_REASONS);
    // Merchant status updates both merchant.is_active and the linked user status.
    await adminModel.setMerchantAccountStatus(
      req.params.merchantId,
      req.body.status === 'active',
      req.session.user.user_id,
      reason
    );

    res.redirect('/admin/user-management/merchants?updated=1');
  } catch (err) {
    console.error(err);
    res.redirect(`/admin/user-management/merchants?error=${encodeURIComponent(err.message || 'Could not update merchant account.')}`);
  }
}

async function showCustomerBookings(req, res) {
  try {
    // Load the customer profile and their booking history together.
    const [customer, bookings] = await Promise.all([
      adminModel.getCustomerAccount(req.params.customerId),
      adminModel.getCustomerBookingsForAdmin(req.params.customerId),
    ]);

    if (!customer) {
      return res.status(404).render('404', { title: 'Customer Not Found' });
    }

    res.render('admin/userCustomerBookings', {
      title: 'Customer Bookings',
      customer,
      bookings,
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/user-management/customers?error=Could not load customer bookings.');
  }
}

async function showMerchantBookings(req, res) {
  try {
    // Load the merchant profile and all bookings under that merchant.
    const [merchant, bookings] = await Promise.all([
      adminModel.getMerchantAccount(req.params.merchantId),
      adminModel.getMerchantBookingsForAdmin(req.params.merchantId),
    ]);

    if (!merchant) {
      return res.status(404).render('404', { title: 'Merchant Not Found' });
    }

    res.render('admin/userMerchantBookings', {
      title: 'Merchant Bookings',
      merchant,
      bookings,
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/user-management/merchants?error=Could not load merchant bookings.');
  }
}

async function featureMerchantFromDashboard(req, res) {
  try {
    await adminModel.addMerchantToFeatured(req.params.merchantId);
    res.redirect('/admin/merchants?featured=1#leaderboard');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/merchants?error=feature#leaderboard');
  }
}

async function toggleFeaturedMerchantFromDashboard(req, res) {
  try {
    await adminModel.toggleFeaturedMerchantVisibility(req.params.listingId);
    res.redirect('/admin/merchants?featuredUpdated=1#leaderboard');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/merchants?error=featureUpdate#leaderboard');
  }
}

async function removeFeaturedMerchantFromDashboard(req, res) {
  try {
    await adminModel.removeFeaturedMerchantListing(req.params.listingId);
    res.redirect('/admin/merchants?featuredRemoved=1#leaderboard');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/merchants?error=featureRemove#leaderboard');
  }
}

async function showFeaturedMerchants(req, res) {
  try {
    const listings = await adminModel.getFeaturedMerchantListings();

    res.render('admin/featured', {
      title: 'Featured Merchants',
      listings,
      query: req.query,
      error: null,
    });
  } catch (err) {
    console.error(err);
    res.render('admin/featured', {
      title: 'Featured Merchants',
      listings: [],
      query: req.query,
      error: 'Failed to load featured merchants.',
    });
  }
}

async function toggleFeaturedMerchant(req, res) {
  try {
    await adminModel.toggleFeaturedMerchantVisibility(req.params.listingId);
    res.redirect('/admin/featured?updated=1');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/featured?error=update');
  }
}

async function removeFeaturedMerchant(req, res) {
  try {
    await adminModel.removeFeaturedMerchantListing(req.params.listingId);
    res.redirect('/admin/featured?removed=1');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/featured?error=remove');
  }
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function toDateInput(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function emptyMerchantAnalytics() {
  return {
    overview: {},
    revenueTrend: [],
    topServices: [],
    revenueByCategory: [],
    peakSalesPeriods: [],
    paymentBreakdown: [],
    promotionPerformance: [],
    bookingStatus: [],
    peakBookingTimes: [],
    serviceUtilization: [],
    leadTime: {},
    customerSegments: {},
    topCustomers: [],
    loyaltyUsage: [],
    reviewSummary: {},
    campaignPerformance: [],
    bookingChannelAnalytics: [],
    listingPerformance: [],
    staffPerformance: [],
    financial: {},
    topMerchants: [],
  };
}

function emptyCustomerAnalytics() {
  return {
    overview: {},
    accountProfiles: [],
    upcomingBookings: [],
    pastBookings: [],
    bookingStatus: [],
    loyaltySummary: {},
    loyaltyTransactions: [],
    availableVouchers: [],
    spendingTrend: [],
    spendingCategories: [],
    mostVisitedMerchants: [],
    favouriteServices: [],
    bookingFrequency: [],
    recommendedMerchants: [],
    suggestedServices: [],
    behaviourPromotions: [],
    reviewSummary: {},
    recentReviews: [],
    platformFeedback: [],
    security: {},
    reminders: [],
    qrAccess: [],
    paymentMethods: [],
  };
}

function emptyRevenueReport() {
  return {
    overview: {},
    monthly: [],
    categoryBreakdown: [],
    topMerchants: [],
    paymentStatus: [],
    bookingSource: [],
    recentTransactions: [],
  };
}

async function showMerchantValidations(req, res) {
  try {
    const [pendingMerchants, recentDecisions, statusSummary] = await Promise.all([
      adminModel.getPendingMerchantApplications(),
      adminModel.getRecentMerchantValidationDecisions(),
      adminModel.getMerchantValidationStatusSummary(),
    ]);

    res.render('admin/merchantValidations', {
      title: 'Merchant Validations',
      pendingMerchants,
      recentDecisions,
      statusSummary,
      query: req.query,
    });
  } catch (err) {
    console.error(err);
    res.render('admin/merchantValidations', {
      title: 'Merchant Validations',
      pendingMerchants: [],
      recentDecisions: [],
      statusSummary: { pending: 0, approved: 0, rejected: 0 },
      query: req.query,
      error: 'Failed to load merchant validation data.',
    });
  }
}

async function approveMerchant(req, res) {
  try {
    const affectedRows = await adminModel.approveMerchant(
      req.params.merchantId,
      req.session.user.user_id
    );

    res.redirect(`/admin/merchant-validations?${affectedRows ? 'approved=1' : 'unchanged=1'}`);
  } catch (err) {
    console.error(err);
    res.redirect('/admin/merchant-validations?error=approve');
  }
}

async function rejectMerchant(req, res) {
  try {
    const notes = String(req.body.notes || '').trim();
    const affectedRows = await adminModel.rejectMerchant(
      req.params.merchantId,
      req.session.user.user_id,
      notes
    );

    res.redirect(`/admin/merchant-validations?${affectedRows ? 'rejected=1' : 'unchanged=1'}`);
  } catch (err) {
    console.error(err);
    res.redirect('/admin/merchant-validations?error=reject');
  }
}

async function showPromotionApprovals(req, res) {
  try {
    // Show admin the promotion requests waiting for review.
    const pendingPromotions = await promotionModel.getPendingPromotionRequests();

    if (wantsJson(req)) {
      return res.json({ success: true, pendingPromotions });
    }

    res.render('admin/promotionApprovals', {
      title: 'Promotion Approvals',
      pendingPromotions,
      query: req.query,
      error: null,
    });
  } catch (err) {
    console.error('[admin] Failed to load promotion requests:', err);

    if (wantsJson(req)) {
      return res.status(500).json({
        success: false,
        error: err.message || 'Failed to load promotion requests.',
      });
    }

    res.render('admin/promotionApprovals', {
      title: 'Promotion Approvals',
      pendingPromotions: [],
      query: req.query,
      error: err.message
        ? `Failed to load promotion requests: ${err.message}`
        : 'Failed to load promotion requests.',
    });
  }
}

async function approvePromotion(req, res) {
  try {
    // Publish approved merchant promotion to marketplace.
    const affectedRows = await promotionModel.approvePromotion(
      req.params.promoId,
      req.session.user.user_id
    );

    res.redirect(`/admin/promotions?${affectedRows ? 'approved=1' : 'unchanged=1'}`);
  } catch (err) {
    console.error(err);
    res.redirect('/admin/promotions?error=approve');
  }
}

async function rejectPromotion(req, res) {
  try {
    const reason = String(req.body.rejection_reason || '').trim();
    // Keep rejected promotion hidden and store the reason.
    const affectedRows = await promotionModel.rejectPromotion(
      req.params.promoId,
      req.session.user.user_id,
      reason
    );

    res.redirect(`/admin/promotions?${affectedRows ? 'rejected=1' : 'unchanged=1'}`);
  } catch (err) {
    console.error(err);
    res.redirect('/admin/promotions?error=reject');
  }
}

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

async function createCampaign(req, res) {
  const form = req.body;

  try {
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

    await voucherModel.createVoucherCampaign({
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
    });

    res.redirect('/admin/campaigns/vouchers?created=1');
  } catch (err) {
    const [vouchers, merchants, voucherSummary] = await Promise.all([
      voucherModel.getVoucherCampaigns().catch(() => []),
      voucherModel.getApprovedMerchants().catch(() => []),
      voucherModel.getVoucherStatusSummary().catch(() => ({})),
    ]);

    res.render('admin/campaigns', {
      title: 'Voucher & Campaign Management',
      vouchers,
      merchants,
      voucherSummary,
      query: req.query,
      form,
      error: err.code === 'ER_DUP_ENTRY'
        ? 'That voucher code already exists. Please use another code.'
        : err.message,
    });
  }
}

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

async function toggleCampaign(req, res) {
  try {
    await voucherModel.toggleVoucherStatus(req.params.voucherId);
    res.redirect('/admin/campaigns/vouchers?updated=1');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/campaigns/vouchers?error=update');
  }
}

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
  showDashboard,
  showComingSoon,
  showValidationLogs,
  resolveValidationLog,
  replyToWhatsAppSupport,
  showMerchants,
  showCustomers,
  showRevenueReport,
  showPlatformFeedback,
  featureMerchantFromDashboard,
  toggleFeaturedMerchantFromDashboard,
  removeFeaturedMerchantFromDashboard,
  showFeaturedMerchants,
  toggleFeaturedMerchant,
  removeFeaturedMerchant,
  showUserManagementHome,
  showManagedCustomers,
  showManagedMerchants,
  updateCustomerAccountStatus,
  updateMerchantAccountStatus,
  showCustomerBookings,
  showMerchantBookings,
  showMerchantValidations,
  approveMerchant,
  rejectMerchant,
  showPromotionApprovals,
  approvePromotion,
  rejectPromotion,
  showCampaigns,
  showVoucherCampaigns,
  showLoyaltyRewards,
  showEditLoyaltyReward,
  createCampaign,
  createLoyaltyReward,
  updateLoyaltyReward,
  toggleCampaign,
  toggleLoyaltyReward,
};
