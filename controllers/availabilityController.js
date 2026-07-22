const availabilityModel = require('../models/availabilityModel');
const bookingDisruptionModel = require('../models/bookingDisruptionModel');

async function showAvailability(req, res) {
  const merchantId = req.session.user.merchant_id;

  const [availability, closures] = await Promise.all([
    availabilityModel.getAvailabilityByMerchant(merchantId).catch(() => []),
    bookingDisruptionModel.listClosures(merchantId).catch(() => [])
  ]);

  res.render('merchant/availability', {
    title: 'Merchant Availability',
    availability,
    closures
  });
}

async function saveAvailability(req, res) {
  const merchantId = req.session.user.merchant_id;
  const { day_of_week, start_time, end_time, is_active } = req.body;

  if (!day_of_week || !start_time || !end_time) {
    return res.redirect('/merchant/availability');
  }

  await availabilityModel
    .saveAvailability(
      merchantId,
      day_of_week,
      start_time,
      end_time,
      is_active ? 1 : 0
    )
    .catch(console.error);

  res.redirect('/merchant/availability');
}

async function deleteAvailability(req, res) {
  const merchantId = req.session.user.merchant_id;

  await availabilityModel
    .deleteAvailability(req.params.id, merchantId)
    .catch(console.error);

  res.redirect('/merchant/availability');
}

module.exports = {
  showAvailability,
  saveAvailability,
  deleteAvailability
};
