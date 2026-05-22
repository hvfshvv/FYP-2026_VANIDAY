const cancellationPolicyModel = require('../models/cancellationPolicyModel');

async function showPolicy(req, res) {
  const merchantId = req.session.user.merchant_id;

  try {
    const policy = await cancellationPolicyModel.getPolicyByMerchantId(merchantId);

    res.render('merchant/cancellationPolicy', {
      title: 'Cancellation Policy',
      policy,
      policySummary: cancellationPolicyModel.getPolicySummary(policy),
      success: req.query.success,
      error: req.query.error,
    });
  } catch (err) {
    console.error(err);
    res.render('merchant/cancellationPolicy', {
      title: 'Cancellation Policy',
      policy: cancellationPolicyModel.DEFAULT_POLICY,
      policySummary: cancellationPolicyModel.getPolicySummary(cancellationPolicyModel.DEFAULT_POLICY),
      success: null,
      error: 'Could not load cancellation policy.',
    });
  }
}

async function updatePolicy(req, res) {
  const merchantId = req.session.user.merchant_id;

  try {
    await cancellationPolicyModel.updatePolicy(merchantId, {
      minCancelHours: req.body.min_cancel_hours,
      refundPercentage: req.body.refund_percentage,
      allowReschedule: req.body.allow_reschedule === '1',
      isActive: req.body.is_active === '1',
    });

    res.redirect('/merchant/cancellation-policy?success=Cancellation policy updated.');
  } catch (err) {
    console.error(err);
    res.redirect(`/merchant/cancellation-policy?error=${encodeURIComponent(err.message || 'Could not update cancellation policy.')}`);
  }
}

module.exports = {
  showPolicy,
  updatePolicy,
};
