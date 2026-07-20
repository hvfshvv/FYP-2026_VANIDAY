const express = require('express');

const router = express.Router();

router.get('/terms', (req, res) => {
  res.render('legal/terms', { title: 'Terms & Conditions' });
});

router.get('/merchant-terms', (req, res) => {
  res.render('legal/merchantTerms', { title: 'Merchant Terms' });
});

router.get('/cancellation-refund-policy', (req, res) => {
  res.render('legal/cancellationRefundPolicy', { title: 'Cancellation & Refund Policy' });
});

router.get('/privacy-policy', (req, res) => {
  res.render('legal/privacyPolicy', { title: 'Privacy Policy' });
});

module.exports = router;
