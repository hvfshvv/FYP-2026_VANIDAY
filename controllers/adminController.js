const adminModel = require('../models/adminModel');

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

module.exports = { showDashboard, showComingSoon };
