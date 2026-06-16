const qrService = require('../services/qrService');

function getRequestBaseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

async function showQRPage(req, res) {
  const merchantId = req.session.user.merchant_id;

  try {
    // Create missing QR codes before showing the merchant QR page.
    const { bookingQR, arrivalQR } = await qrService.ensureMerchantQRCodes(merchantId, {
      baseUrl: getRequestBaseUrl(req),
    });

    res.render('merchant/qr', {
      title: 'QR Code Management',
      qr: bookingQR,
      arrivalQr: arrivalQR,
    });
  } catch (err) {
    console.error(err);
    res.render('merchant/qr', {
      title: 'QR Code Management',
      qr: null,
      arrivalQr: null,
    });
  }
}

module.exports = {
  showQRPage,
};
