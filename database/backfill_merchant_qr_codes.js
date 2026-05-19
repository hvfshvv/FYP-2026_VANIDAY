require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const db = require('../config/db');
const qrService = require('../services/qrService');

async function backfillMerchantQRCodes() {
  const [merchants] = await db.query(
    `SELECT merchant_id, merchant_name
     FROM merchant
     WHERE is_active = 1
     ORDER BY merchant_id`
  );

  let createdBooking = 0;
  let existingBooking = 0;
  let createdArrival = 0;
  let existingArrival = 0;

  for (const merchant of merchants) {
    const beforeBooking = await db.query(
      `SELECT qr_id
       FROM qr_code
       WHERE merchant_id = ?
         AND qr_type = 'booking'
         AND is_active = 1
       LIMIT 1`,
      [merchant.merchant_id]
    );

    const beforeArrival = await db.query(
      `SELECT qr_id
       FROM qr_code
       WHERE merchant_id = ?
         AND qr_type = 'check_in'
         AND is_active = 1
       LIMIT 1`,
      [merchant.merchant_id]
    );

    await qrService.ensureMerchantQRCodes(merchant.merchant_id);

    if (beforeBooking[0].length) {
      existingBooking += 1;
    } else {
      createdBooking += 1;
      console.log(`Created booking QR for ${merchant.merchant_name} (#${merchant.merchant_id})`);
    }

    if (beforeArrival[0].length) {
      existingArrival += 1;
    } else {
      createdArrival += 1;
      console.log(`Created arrival QR for ${merchant.merchant_name} (#${merchant.merchant_id})`);
    }
  }

  console.log(`QR backfill complete. Booking created: ${createdBooking}. Booking existing: ${existingBooking}. Arrival created: ${createdArrival}. Arrival existing: ${existingArrival}.`);
  await db.end();
}

backfillMerchantQRCodes().catch(err => {
  console.error('QR backfill failed:', err);
  process.exit(1);
});
