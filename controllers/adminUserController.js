/*
 * adminUserController.js
 * Handles the admin user management section: listing/searching customers and
 * merchants, enabling/disabling accounts with validated reasons, and viewing
 * individual booking histories for admin oversight.
 */

const adminUserModel = require('../models/adminUserModel');

// ── DISABLE REASON CONSTANTS ───────────────────────────────────────────────

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

// Validates and returns the disable reason, throwing if the account is being suspended without a valid reason.
function requireDisableReason(status, reason, allowedReasons) {
  if (status !== 'suspended') return null;

  const safeReason = String(reason || '').trim();
  if (!allowedReasons.includes(safeReason)) {
    throw new Error('Please select a valid reason before disabling the account.');
  }

  return safeReason;
}

// ── USER MANAGEMENT HOME ───────────────────────────────────────────────────

// Renders the user management landing page with customer and merchant summary counts.
async function showUserManagementHome(req, res) {
  try {
    // Summary counts power the two cards on admin/userManagement.ejs.
    const summary = await adminUserModel.getUserManagementSummary();
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

// ── CUSTOMER MANAGEMENT ────────────────────────────────────────────────────

// Renders the customer account list with optional keyword search.
async function showManagedCustomers(req, res) {
  try {
    // Optional search is passed straight from the query string.
    const customers = await adminUserModel.getManagedCustomers(req.query.search);
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

// Renders the merchant account list with optional keyword search and verification filter.
async function showManagedMerchants(req, res) {
  try {
    // Only allow known verification filters before passing to the model.
    const verification = ['pending', 'approved'].includes(req.query.verification)
      ? req.query.verification
      : 'all';
    const merchants = await adminUserModel.getManagedMerchants(req.query.search, verification);
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

// ── ACCOUNT STATUS UPDATES ─────────────────────────────────────────────────

// Enables or suspends a customer account after validating the reason when suspending.
async function updateCustomerAccountStatus(req, res) {
  try {
    const reason = requireDisableReason(req.body.status, req.body.disable_reason, CUSTOMER_DISABLE_REASONS);
    // Admin can enable or disable a customer account from the table.
    await adminUserModel.setUserAccountStatus(
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

// Enables or suspends a merchant account (keeps merchant.is_active and users.status in sync).
async function updateMerchantAccountStatus(req, res) {
  try {
    const reason = requireDisableReason(req.body.status, req.body.disable_reason, MERCHANT_DISABLE_REASONS);
    // Merchant status updates both merchant.is_active and the linked user status.
    await adminUserModel.setMerchantAccountStatus(
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

// ── BOOKING HISTORY VIEWS ──────────────────────────────────────────────────

// Renders the admin view of a single customer's full booking history.
async function showCustomerBookings(req, res) {
  try {
    // Load the customer profile and their booking history together.
    const [customer, bookings] = await Promise.all([
      adminUserModel.getCustomerAccount(req.params.customerId),
      adminUserModel.getCustomerBookingsForAdmin(req.params.customerId),
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

// Renders the admin view of a single merchant's full booking history.
async function showMerchantBookings(req, res) {
  try {
    // Load the merchant profile and all bookings under that merchant.
    const [merchant, bookings] = await Promise.all([
      adminUserModel.getMerchantAccount(req.params.merchantId),
      adminUserModel.getMerchantBookingsForAdmin(req.params.merchantId),
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

module.exports = {
  showUserManagementHome,
  showManagedCustomers,
  showManagedMerchants,
  updateCustomerAccountStatus,
  updateMerchantAccountStatus,
  showCustomerBookings,
  showMerchantBookings,
};
