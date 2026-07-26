/*
 * adminMerchantController.js
 * Handles admin merchant management: verification approvals/rejections,
 * featured listing management (from both the analytics dashboard and the
 * dedicated featured page), and promotion approval workflows.
 */

const fs = require('fs');
const path = require('path');
const adminUserModel = require('../models/adminUserModel');
const promotionModel = require('../models/promotionModel');
const { wantsJson } = require('../middleware/auth');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ACRA_UPLOAD_ROOT = path.resolve(PROJECT_ROOT, 'uploads', 'merchant-acra');

function safePdfFilename(name, merchantId) {
  const fallback = `merchant-${merchantId}-acra.pdf`;
  const basename = path.basename(String(name || fallback));
  const cleaned = basename.replace(/[^a-zA-Z0-9._ -]/g, '_');
  return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
}

function resolveStoredAcraPath(storedPath) {
  const normalizedPath = String(storedPath || '').replace(/\\/g, '/');
  if (!normalizedPath || path.isAbsolute(normalizedPath)) return null;

  const resolved = path.resolve(PROJECT_ROOT, normalizedPath);
  const relativeToUploadRoot = path.relative(ACRA_UPLOAD_ROOT, resolved);
  const isInsideUploadRoot = relativeToUploadRoot
    && !relativeToUploadRoot.startsWith('..')
    && !path.isAbsolute(relativeToUploadRoot);

  if (!isInsideUploadRoot || path.extname(resolved).toLowerCase() !== '.pdf') {
    return null;
  }

  return resolved;
}

// ── MERCHANT VALIDATION ────────────────────────────────────────────────────

// Renders the merchant validations page with pending applications and recent decisions.
async function showMerchantValidations(req, res) {
  try {
    const [pendingMerchants, recentDecisions, statusSummary] = await Promise.all([
      adminUserModel.getPendingMerchantApplications(),
      adminUserModel.getRecentMerchantValidationDecisions(),
      adminUserModel.getMerchantValidationStatusSummary(),
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

// Approves a pending merchant application and redirects with outcome query param.
async function approveMerchant(req, res) {
  try {
    const affectedRows = await adminUserModel.approveMerchant(
      req.params.merchantId,
      req.session.user.user_id
    );

    res.redirect(`/admin/merchant-validations?${affectedRows ? 'approved=1' : 'unchanged=1'}`);
  } catch (err) {
    console.error(err);
    res.redirect('/admin/merchant-validations?error=approve');
  }
}

// Rejects a pending merchant application with optional rejection notes.
async function rejectMerchant(req, res) {
  try {
    const notes = String(req.body.notes || '').trim();
    const affectedRows = await adminUserModel.rejectMerchant(
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

async function viewMerchantAcraDocument(req, res) {
  try {
    const merchant = await adminUserModel.getMerchantAcraDocument(req.params.merchantId);
    const resolvedPath = resolveStoredAcraPath(merchant && merchant.acra_profile_path);

    if (!merchant || !resolvedPath || !fs.existsSync(resolvedPath)) {
      return res.status(404).send('ACRA document not found.');
    }

    const filename = safePdfFilename(
      merchant.acra_profile_original_name || `${merchant.merchant_name || 'merchant'}-acra.pdf`,
      merchant.merchant_id
    );

    return res.sendFile(resolvedPath, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
      },
    });
  } catch (err) {
    console.error('[admin] Failed to load ACRA document:', err.message);
    return res.status(404).send('ACRA document not found.');
  }
}

// ── FEATURED LISTINGS (from analytics dashboard) ───────────────────────────

// Adds a merchant to featured listings from the merchant analytics leaderboard.
async function featureMerchantFromDashboard(req, res) {
  try {
    await adminUserModel.addMerchantToFeatured(req.params.merchantId);
    res.redirect('/admin/merchants?featured=1#leaderboard');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/merchants?error=feature#leaderboard');
  }
}

// Toggles featured listing visibility from the merchant analytics page.
async function toggleFeaturedMerchantFromDashboard(req, res) {
  try {
    await adminUserModel.toggleFeaturedMerchantVisibility(req.params.listingId);
    res.redirect('/admin/merchants?featuredUpdated=1#leaderboard');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/merchants?error=featureUpdate#leaderboard');
  }
}

// Removes a featured listing from the merchant analytics page.
async function removeFeaturedMerchantFromDashboard(req, res) {
  try {
    await adminUserModel.removeFeaturedMerchantListing(req.params.listingId);
    res.redirect('/admin/merchants?featuredRemoved=1#leaderboard');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/merchants?error=featureRemove#leaderboard');
  }
}

// ── FEATURED LISTINGS (dedicated page) ────────────────────────────────────

// Renders the dedicated featured merchants management page.
async function showFeaturedMerchants(req, res) {
  try {
    const listings = await adminUserModel.getFeaturedMerchantListings();

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

// Toggles the visibility of a featured listing from the dedicated featured page.
async function toggleFeaturedMerchant(req, res) {
  try {
    await adminUserModel.toggleFeaturedMerchantVisibility(req.params.listingId);
    res.redirect('/admin/featured?updated=1');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/featured?error=update');
  }
}

// Removes a featured listing from the dedicated featured page.
async function removeFeaturedMerchant(req, res) {
  try {
    await adminUserModel.removeFeaturedMerchantListing(req.params.listingId);
    res.redirect('/admin/featured?removed=1');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/featured?error=remove');
  }
}

// ── PROMOTION APPROVALS ────────────────────────────────────────────────────

// Renders the promotion approvals page showing pending and past-approved promotions.
async function showPromotionApprovals(req, res) {
  try {
    // Show admin the promotion requests waiting for review and approved promotions that have ended.
    const [pendingPromotions, pastApprovedPromotions] = await Promise.all([
      promotionModel.getPendingPromotionRequests(),
      promotionModel.getPastApprovedPromotions(),
    ]);

    if (wantsJson(req)) {
      return res.json({ success: true, pendingPromotions, pastApprovedPromotions });
    }

    res.render('admin/promotionApprovals', {
      title: 'Promotion Approvals',
      pendingPromotions,
      pastApprovedPromotions,
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
      pastApprovedPromotions: [],
      query: req.query,
      error: err.message
        ? `Failed to load promotion requests: ${err.message}`
        : 'Failed to load promotion requests.',
    });
  }
}

// Publishes an approved merchant promotion to the marketplace.
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

// Rejects a promotion request, storing the rejection reason for the merchant to see.
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

module.exports = {
  showMerchantValidations,
  approveMerchant,
  rejectMerchant,
  viewMerchantAcraDocument,
  featureMerchantFromDashboard,
  toggleFeaturedMerchantFromDashboard,
  removeFeaturedMerchantFromDashboard,
  showFeaturedMerchants,
  toggleFeaturedMerchant,
  removeFeaturedMerchant,
  showPromotionApprovals,
  approvePromotion,
  rejectPromotion,
};
