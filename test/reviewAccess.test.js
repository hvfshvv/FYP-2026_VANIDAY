const test = require('node:test');
const assert = require('node:assert/strict');
const { requireCustomer } = require('../middleware/auth');

function responseStub() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('review routes allow customer accounts', () => {
  let called = false;
  requireCustomer(
    { session: { user: { role: 'customer' } }, xhr: false, get: () => '', is: () => false },
    responseStub(),
    () => { called = true; }
  );
  assert.equal(called, true);
});

test('review routes reject non-customer accounts', () => {
  const res = responseStub();
  requireCustomer(
    { session: { user: { role: 'merchant' } }, xhr: false, get: () => '', is: () => false },
    res,
    () => assert.fail('merchant must not pass customer review guard')
  );
  assert.equal(res.statusCode, 403);
});
