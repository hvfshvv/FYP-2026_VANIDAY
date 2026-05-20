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

async function generateQRCode(req, res) {
  const merchantId = req.session.user.merchant_id;

  try {
    // Regenerate the booking QR when the merchant needs a new printout.
    await qrService.createBookingQRForMerchant(merchantId, {
      baseUrl: getRequestBaseUrl(req),
    });
    res.redirect('/merchant/qr');
  } catch (err) {
    console.error(err);
    res.redirect('/merchant/qr');
  }
}

async function regenerateArrivalQRCode(req, res) {
  const merchantId = req.session.user.merchant_id;

  try {
    // Regenerate the counter QR used for customer arrival check-in.
    await qrService.createArrivalQRForMerchant(merchantId, {
      baseUrl: getRequestBaseUrl(req),
    });
    res.redirect('/merchant/qr');
  } catch (err) {
    console.error(err);
    res.redirect('/merchant/qr');
  }
}

const regenerateQRCode = generateQRCode;

module.exports = {
  showQRPage,
  generateQRCode,
  regenerateQRCode,
  regenerateArrivalQRCode,
};
