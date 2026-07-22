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
      policy: null,
      policySummary: cancellationPolicyModel.getPolicySummary(),
      success: null,
      error: 'Could not load cancellation policy.',
    });
  }
}

module.exports = {
  showPolicy,
};
