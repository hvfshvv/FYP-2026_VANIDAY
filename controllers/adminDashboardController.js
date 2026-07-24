/*
 * adminDashboardController.js
 * Handles the admin dashboard home, revenue report, merchant analytics,
 * customer analytics, and platform feedback pages. Provides date-range
 * helper utilities shared across the analytics controllers.
 */

const adminDashboardModel = require('../models/adminDashboardModel');
const adminAnalyticsModel = require('../models/adminAnalyticsModel');
const adminUserModel = require('../models/adminUserModel');

// ── DATE HELPERS ───────────────────────────────────────────────────────────

// Returns true if the value is a valid YYYY-MM-DD string.
function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

// Converts a Date object to a YYYY-MM-DD string for date input fields.
function toDateInput(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DASHBOARD_PERIODS = {
  this_month: 'This Month',
  last_30_days: 'Last 30 Days',
  this_year: 'This Year',
  all_time: 'All Time',
};

function getSingaporeDateParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

function toSingaporeDateString({ year, month, day }) {
  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
}

function shiftDateString(dateParts, offsetDays) {
  const date = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day));
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function buildDashboardPeriod(value) {
  const selected = Object.prototype.hasOwnProperty.call(DASHBOARD_PERIODS, value)
    ? value
    : 'this_month';
  const todayParts = getSingaporeDateParts();
  const today = toSingaporeDateString(todayParts);

  if (selected === 'all_time') {
    return {
      key: selected,
      label: DASHBOARD_PERIODS[selected],
      startDate: null,
      endDate: null,
      isAllTime: true,
      asOfDate: today,
      options: DASHBOARD_PERIODS,
    };
  }

  const startDate = selected === 'last_30_days'
    ? shiftDateString(todayParts, -29)
    : selected === 'this_year'
      ? `${todayParts.year}-01-01`
      : `${todayParts.year}-${String(todayParts.month).padStart(2, '0')}-01`;

  return {
    key: selected,
    label: DASHBOARD_PERIODS[selected],
    startDate,
    endDate: today,
    isAllTime: false,
    asOfDate: today,
    options: DASHBOARD_PERIODS,
  };
}

// ── EMPTY FALLBACKS ────────────────────────────────────────────────────────

// Returns an empty merchant analytics object used when the DB query fails.
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

// Returns an empty customer analytics object used when the DB query fails.
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
    staffPerformance: [],
    paymentMethods: [],
  };
}

// Returns an empty revenue report object used when the DB query fails.
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

// ── DASHBOARD PAGES ────────────────────────────────────────────────────────

// Renders the admin dashboard home with platform KPI counts and recent validation errors.
async function showDashboard(req, res) {
  const dashboardPeriod = buildDashboardPeriod(req.query.period);

  try {
    const [summary, recentErrors] = await Promise.all([
      adminDashboardModel.getDashboardSummary(dashboardPeriod),
      adminDashboardModel.getRecentValidationErrors().catch(err => {
        console.error('Failed to load validation logs:', err.message);
        return [];
      }),
    ]);

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      summary,
      recentErrors,
      dashboardPeriod,
    });
  } catch (err) {
    console.error(err);
    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      summary: {},
      recentErrors: [],
      dashboardPeriod,
      error: 'Failed to load admin dashboard data.',
    });
  }
}

// Renders a coming-soon placeholder for unbuilt admin sections.
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

// Renders the merchant analytics page for a user-selected date range.
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
    const analytics = await adminAnalyticsModel.getMerchantAnalytics(range);

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

// Renders the customer analytics page for a user-selected date range.
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
    const analytics = await adminAnalyticsModel.getCustomerAnalytics(range);

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

// Renders the platform revenue report for a user-selected date range.
async function showRevenueReport(req, res) {
  const today = new Date();
  const defaultStart = new Date(today);
  defaultStart.setDate(defaultStart.getDate() - 29);
  const requestedStartDate = req.query.startDate || req.query.from;
  const requestedEndDate = req.query.endDate || req.query.to;

  const range = {
    startDate: isDate(requestedStartDate) ? requestedStartDate : toDateInput(defaultStart),
    endDate: isDate(requestedEndDate) ? requestedEndDate : toDateInput(today),
  };

  if (new Date(range.endDate) < new Date(range.startDate)) {
    range.endDate = range.startDate;
  }

  try {
    const report = await adminDashboardModel.getPlatformRevenueReport(range);

    res.render('admin/revenue', {
      title: 'Revenue Summary',
      report,
      range,
      error: null,
    });
  } catch (err) {
    console.error(err);
    res.render('admin/revenue', {
      title: 'Revenue Summary',
      report: emptyRevenueReport(),
      range,
      error: 'Failed to load revenue report.',
    });
  }
}

// Renders the platform feedback listing page with optional type/rating/search filters.
async function showPlatformFeedback(req, res) {
  const filters = {
    type: req.query.type || 'all',
    rating: req.query.rating || 'all',
    search: req.query.search || '',
  };

  try {
    const [feedback, summary] = await Promise.all([
      adminUserModel.getPlatformFeedback(filters),
      adminUserModel.getPlatformFeedbackSummary(),
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

module.exports = {
  showDashboard,
  showComingSoon,
  showMerchants,
  showCustomers,
  showRevenueReport,
  showPlatformFeedback,
  isDate,
  toDateInput,
  buildDashboardPeriod,
};
