const payoutModel = require('../models/payoutModel');

async function showPayouts(req, res) {
  try {
    const status = ['pending', 'processing', 'paid', 'failed', 'cancelled'].includes(String(req.query.status || ''))
      ? String(req.query.status)
      : null;

    const [summary, eligibleGroups, payouts, eligibleTrend, outstandingBreakdown, merchantSizeBuckets] = await Promise.all([
      payoutModel.getPayoutSummary(),
      payoutModel.getEligiblePayoutGroups(),
      payoutModel.getPayouts({ status, limit: 150 }),
      payoutModel.getEligibleWeeklyTrend(8),
      payoutModel.getOutstandingBreakdown(5),
      payoutModel.getEligibleMerchantSizeBuckets(),
    ]);

    res.render('admin/payouts', {
      title: 'Merchant Payouts',
      summary,
      eligibleGroups,
      payouts,
      eligibleTrend,
      outstandingBreakdown,
      merchantSizeBuckets,
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
      eligibleTrend: [],
      outstandingBreakdown: [],
      merchantSizeBuckets: [],
      selectedStatus: null,
      success: null,
      error: 'Could not load merchant payouts.',
    });
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

module.exports = {
  showPayouts,
  showPayoutDetail,
};
