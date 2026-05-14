// PayNow simulation service for FYP/prototype.
// For production, integrate with HitPay (sandbox available) or your bank's PayNow API.

function getPayNowDetails(bookingId, amount) {
  return {
    uen: process.env.PAYNOW_UEN || '202512345A', // Replace with your business UEN
    reference: `BK${String(bookingId).padStart(6, '0')}`,
    amount,
    qrImagePath: '/images/paynow-qr.png', // Place your static PayNow QR here
  };
}

function generateTransactionRef(bookingId) {
  return `PAYNOW-${bookingId}-${Date.now()}`;
}

module.exports = { getPayNowDetails, generateTransactionRef };
