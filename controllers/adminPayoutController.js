const payoutModel = require('../models/payoutModel');

async function showPayouts(req, res) {
  try {
    const status = ['pending', 'processing', 'paid', 'failed', 'cancelled'].includes(String(req.query.status || ''))
      ? String(req.query.status)
      : null;

    const [summary, eligibleGroups, payouts] = await Promise.all([
      payoutModel.getPayoutSummary(),
      payoutModel.getEligiblePayoutGroups(),
      payoutModel.getPayouts({ status, limit: 150 }),
    ]);

    res.render('admin/payouts', {
      title: 'Merchant Payouts',
      summary,
      eligibleGroups,
      payouts,
      selectedStatus: status,
      success: req.query.success || null,
      error: req.query.error || null,
    });
  } catch (err) {
    console.error('[admin payouts] showPayouts error:', err);
    res.status(500).render('admin/payouts', {
      title: 'Merchant Payouts',
      summary: {},
      eligibleGroups: [],
      payouts: [],
      selectedStatus: null,
      success: null,
      error: 'Could not load merchant payouts.',
    });
  }
}

async function createPayout(req, res) {
  const merchantId = Number(req.params.merchantId);
  if (!merchantId) {
    return res.redirect('/admin/payouts?error=' + encodeURIComponent('Invalid merchant.'));
  }

  try {
    const result = await payoutModel.createMerchantPayout(merchantId, req.session.user.user_id);
    if (!result.created) {
      return res.redirect('/admin/payouts?error=' + encodeURIComponent('No eligible completed paid bookings for this merchant.'));
    }

    res.redirect('/admin/payouts?success=' + encodeURIComponent(`Created payout #${result.payoutId}. Settlement amount is masked in admin views.`));
  } catch (err) {
    console.error('[admin payouts] createPayout error:', err);
    res.redirect('/admin/payouts?error=' + encodeURIComponent('Could not create payout batch.'));
  }
}

async function showPayoutDetail(req, res) {
  try {
    const result = await payoutModel.getPayoutById(req.params.payoutId);
    if (!result) return res.redirect('/admin/payouts?error=' + encodeURIComponent('Payout not found.'));

    res.render('admin/payoutDetail', {
      title: `Payout #${result.payout.payout_id}`,
      payout: result.payout,
      items: result.items,
      success: req.query.success || null,
      error: req.query.error || null,
    });
  } catch (err) {
    console.error('[admin payouts] showPayoutDetail error:', err);
    res.redirect('/admin/payouts?error=' + encodeURIComponent('Could not load payout details.'));
  }
}

async function markPayoutPaid(req, res) {
  const payoutId = Number(req.params.payoutId);
  const payoutReference = String(req.body.payout_reference || '').trim();
  const adminNote = String(req.body.admin_note || '').trim();

  try {
    const updated = await payoutModel.markPayoutPaid(payoutId, req.session.user.user_id, {
      payoutReference,
      adminNote,
    });

    const query = updated
      ? '?success=' + encodeURIComponent('Payout marked as paid.')
      : '?error=' + encodeURIComponent('Only pending or processing payouts can be marked paid.');

    res.redirect(`/admin/payouts/${payoutId}${query}`);
  } catch (err) {
    console.error('[admin payouts] markPayoutPaid error:', err);
    res.redirect(`/admin/payouts/${payoutId}?error=` + encodeURIComponent('Could not update payout.'));
  }
}

module.exports = {
  showPayouts,
  createPayout,
  showPayoutDetail,
  markPayoutPaid,
};
