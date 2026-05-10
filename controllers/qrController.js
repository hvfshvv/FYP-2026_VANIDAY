const path    = require('path');
const QRCode  = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const qrModel = require('../models/qrModel');

async function showQRPage(req, res) {
  const merchantId = req.session.user.merchant_id;
  try {
    const qr = await qrModel.getActiveQRByMerchant(merchantId);
    res.render('merchant/qr', { title: 'QR Code Management', qr });
  } catch (err) {
    console.error(err);
    res.render('merchant/qr', { title: 'QR Code Management', qr: null });
  }
}

async function generateQRCode(req, res) {
  const merchantId = req.session.user.merchant_id;
  try {
    await qrModel.deactivateMerchantQRs(merchantId);

    const token     = uuidv4();
    const bookingUrl = `${process.env.APP_URL}/book/${token}`;
    const fileName  = `${token}.png`;
    const filePath  = path.join(__dirname, '..', 'public', 'images', 'qr', fileName);
    const dbPath    = `/images/qr/${fileName}`;

    await QRCode.toFile(filePath, bookingUrl, { width: 400, margin: 2 });
    await qrModel.insertQR(merchantId, token, dbPath);

    res.redirect('/merchant/qr');
  } catch (err) {
    console.error(err);
    res.redirect('/merchant/qr');
  }
}

// regenerate reuses the same flow — old QR is deactivated in generateQRCode
const regenerateQRCode = generateQRCode;

module.exports = { showQRPage, generateQRCode, regenerateQRCode };
