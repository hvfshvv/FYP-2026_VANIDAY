const adminModel = require('../models/adminModel');
const voucherModel = require('../models/voucherModel');
const promotionModel = require('../models/promotionModel');
const { wantsJson } = require('../middleware/auth');

async function showDashboard(req, res) {
  try {
    const [summary, recentBookings, recentPayments, recentErrors] = await Promise.all([
      adminModel.getDashboardSummary(),
      adminModel.getRecentBookings(),
      adminModel.getRecentPayments(),
      adminModel.getRecentValidationErrors().catch(err => {
        console.error('Failed to load validation logs:', err.message);
        return [];
      }),
    ]);

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      summary,
      recentBookings,
      recentPayments,
      recentErrors,
    });
  } catch (err) {
    console.error(err);
    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      summary: {},
      recentBookings: [],
      recentPayments: [],
      recentErrors: [],
      error: 'Failed to load admin dashboard data.',
    });
  }
}

function showComingSoon(req, res) {
  const pages = {
    customers: 'Manage Customers',
    merchants: 'Manage Merchants',
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

async function showUserManagementHome(req, res) {
  try {
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
    const customers = await adminModel.getManagedCustomers(req.query.search);
    res.render('admin/userCustomers', {
      title: 'Customer Accounts',
      customers,
      search: req.query.search || '',
      query: req.query,
    });
  } catch (err) {
    console.error(err);
    res.render('admin/userCustomers', {
      title: 'Customer Accounts',
      customers: [],
      search: req.query.search || '',
      query: req.query,
      error: 'Failed to load customer accounts.',
    });
  }
}

async function showManagedMerchants(req, res) {
  try {
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
    });
  } catch (err) {
    console.error(err);
    res.render('admin/userMerchants', {
      title: 'Merchant Accounts',
      merchants: [],
      search: req.query.search || '',
      verification: req.query.verification || 'all',
      query: req.query,
      error: 'Failed to load merchant accounts.',
    });
  }
}

async function updateCustomerAccountStatus(req, res) {
  try {
    await adminModel.setUserAccountStatus(
      req.params.customerId,
      req.body.status,
      req.session.user.user_id
    );

    res.redirect('/admin/user-management/customers?updated=1');
  } catch (err) {
    console.error(err);
    res.redirect(`/admin/user-management/customers?error=${encodeURIComponent(err.message || 'Could not update customer account.')}`);
  }
}

async function updateMerchantAccountStatus(req, res) {
  try {
    await adminModel.setMerchantAccountStatus(
      req.params.merchantId,
      req.body.status === 'active',
      req.session.user.user_id
    );

    res.redirect('/admin/user-management/merchants?updated=1');
  } catch (err) {
    console.error(err);
    res.redirect(`/admin/user-management/merchants?error=${encodeURIComponent(err.message || 'Could not update merchant account.')}`);
  }
}

async function showCustomerBookings(req, res) {
  try {
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

async function showMerchantValidations(req, res) {
  try {
    const [pendingMerchants, recentDecisions, statusSummary, applicationTrend] = await Promise.all([
      adminModel.getPendingMerchantApplications(),
      adminModel.getRecentMerchantValidationDecisions(),
      adminModel.getMerchantValidationStatusSummary(),
      adminModel.getMerchantApplicationTrend(),
    ]);

    res.render('admin/merchantValidations', {
      title: 'Merchant Validations',
      pendingMerchants,
      recentDecisions,
      statusSummary,
      applicationTrend,
      query: req.query,
    });
  } catch (err) {
    console.error(err);
    res.render('admin/merchantValidations', {
      title: 'Merchant Validations',
      pendingMerchants: [],
      recentDecisions: [],
      statusSummary: { pending: 0, approved: 0, rejected: 0 },
      applicationTrend: [],
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

    res.redirect('/admin/campaigns?created=1');
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

async function toggleCampaign(req, res) {
  try {
    await voucherModel.toggleVoucherStatus(req.params.voucherId);
    res.redirect('/admin/campaigns?updated=1');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/campaigns?error=update');
  }
}

module.exports = {
  showDashboard,
  showComingSoon,
  showMerchants,
  showCustomers,
  featureMerchantFromDashboard,
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
  createCampaign,
  toggleCampaign,
};
