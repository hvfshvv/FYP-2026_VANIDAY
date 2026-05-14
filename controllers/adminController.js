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

module.exports = { showDashboard };
