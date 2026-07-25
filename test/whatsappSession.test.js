const test = require('node:test');
const assert = require('node:assert/strict');

const whatsappModel = require('../models/whatsappModel');

test('WhatsApp session keys normalize Singapore local and Twilio phone formats', () => {
  assert.equal(whatsappModel.cleanPhone('88880000'), '+6588880000');
  assert.equal(whatsappModel.cleanPhone('+6588880000'), '+6588880000');
  assert.equal(whatsappModel.cleanPhone('whatsapp:+6588880000'), '+6588880000');
});
