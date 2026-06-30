const serviceModel = require('../models/serviceModel');
const staffModel = require('../models/staffModel');

async function showStaff(req, res) {
  const merchantId = req.session.user.merchant_id;

  const [staff, services] = await Promise.all([
    staffModel.getStaffByMerchant(merchantId).catch(() => []),
    serviceModel.getServicesByMerchant(merchantId).catch(() => [])
  ]);

  res.render('merchant/staff', {
    title: 'Manage Staff',
    staff,
    services
  });
}

async function addStaff(req, res) {
  const merchantId = req.session.user.merchant_id;

  const {
    full_name,
    role,
    bio,
    experience_years,
    service_ids
  } = req.body;

  if (!full_name || full_name.trim() === '') {
    return res.redirect('/merchant/staff');
  }

  await staffModel.addStaff(
    merchantId,
    full_name.trim(),
    role,
    bio,
    experience_years,
    service_ids
  ).catch(console.error);

  res.redirect('/merchant/staff');
}

async function editStaff(req, res) {
  try {
    const merchantId = req.session.user.merchant_id;
    const staffId = req.params.id;

    const {
      full_name,
      role,
      bio,
      experience_years,
      service_ids
    } = req.body;

    await staffModel.updateStaff(
      staffId,
      merchantId,
      full_name,
      role,
      bio,
      experience_years,
      service_ids
    );

    res.redirect('/merchant/staff');
  } catch (err) {
    console.error(err);
    res.redirect('/merchant/staff');
  }
}

async function toggleStaff(req, res) {
  const merchantId = req.session.user.merchant_id;

  await staffModel
    .toggleStaff(req.params.id, merchantId)
    .catch(console.error);

  res.redirect('/merchant/staff');
}

async function deleteStaff(req, res) {
  const merchantId = req.session.user.merchant_id;

  await staffModel
    .deleteStaff(req.params.id, merchantId)
    .catch(console.error);

  res.redirect('/merchant/staff');
}

module.exports = {
  showStaff,
  addStaff,
  editStaff,
  toggleStaff,
  deleteStaff
};
