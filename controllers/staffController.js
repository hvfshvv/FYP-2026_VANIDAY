const staffModel = require('../models/staffModel');

async function showStaff(req, res) {
  const merchantId = req.session.user.merchant_id;

  const staff = await staffModel
    .getStaffByMerchant(merchantId)
    .catch(() => []);

  res.render('merchant/staff', {
    title: 'Manage Staff',
    staff
  });
}

async function addStaff(req, res) {
  const merchantId = req.session.user.merchant_id;
  const { full_name, role, bio, experience_years } = req.body;

  if (!full_name || full_name.trim() === '') {
    return res.redirect('/merchant/staff');
  }

  await staffModel
    .addStaff(merchantId, full_name.trim(), role, bio, experience_years)
    .catch(console.error);

  res.redirect('/merchant/staff');
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
  toggleStaff,
  deleteStaff
};