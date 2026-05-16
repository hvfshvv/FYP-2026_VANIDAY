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

async function showMerchantValidations(req, res) {
  try {
    const [pendingMerchants, recentDecisions] = await Promise.all([
      adminModel.getPendingMerchantApplications(),
      adminModel.getRecentMerchantValidationDecisions(),
    ]);

    res.render('admin/merchantValidations', {
      title: 'Merchant Validations',
      pendingMerchants,
      recentDecisions,
      query: req.query,
    });
  } catch (err) {
    console.error(err);
    res.render('admin/merchantValidations', {
      title: 'Merchant Validations',
      pendingMerchants: [],
      recentDecisions: [],
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

module.exports = {
  showDashboard,
  showComingSoon,
  showMerchantValidations,
  approveMerchant,
  rejectMerchant,
};
