const serviceModel = require('../models/serviceModel');

async function showServices(req, res) {
  const merchantId = req.session.user.merchant_id;
  try {
    const services = await serviceModel.getServicesByMerchant(merchantId);
    const added = req.query.added === '1';
    res.render('merchant/services', { title: 'My Services', services, error: null, added });
  } catch (err) {
    console.error(err);
    res.render('merchant/services', { title: 'My Services', services: [], error: 'Failed to load services.', added: false });
  }
}

async function addService(req, res) {
  const merchantId = req.session.user.merchant_id;
  const { service_name, description, price, duration_mins } = req.body;
  try {
    if (!service_name || !price || !duration_mins) throw new Error('Missing required fields');
    await serviceModel.addService(merchantId, { service_name, description, price, duration_mins });
    res.redirect('/merchant/services?added=1');
  } catch (err) {
    const services = await serviceModel.getServicesByMerchant(merchantId).catch(() => []);
    res.render('merchant/services', { title: 'My Services', services, error: 'Could not add service. Please fill in all required fields.', added: false });
  }
}

async function toggleService(req, res) {
  const merchantId = req.session.user.merchant_id;
  await serviceModel.toggleService(req.params.id, merchantId).catch(console.error);
  res.redirect('/merchant/services');
}

async function deleteService(req, res) {
  const merchantId = req.session.user.merchant_id;
  await serviceModel.deleteService(req.params.id, merchantId).catch(console.error);
  res.redirect('/merchant/services');
}

module.exports = { showServices, addService, toggleService, deleteService };
