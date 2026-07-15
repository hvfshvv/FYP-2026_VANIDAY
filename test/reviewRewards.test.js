const test = require('node:test');
const assert = require('node:assert/strict');
const loyaltyModel = require('../models/loyaltyModel');

test('a completed booking review earns two points without a photo', () => {
  assert.equal(loyaltyModel.getReviewBonusPoints(false), 2);
});

test('a completed booking review earns three total points with a photo', () => {
  assert.equal(loyaltyModel.getReviewBonusPoints(true), 3);
});
