const test = require('node:test');
const assert = require('node:assert/strict');

const insightsModel = require('../models/merchantInsightsModel');
const {
  resolveInsightPeriod,
  buildMerchantInsights,
} = require('../services/merchantInsightsService');
const merchantInsightsController = require('../controllers/merchantInsightsController');

function row(overrides = {}) {
  return {
    booking_id: 1,
    customer_id: 10,
    status: 'completed',
    booking_date: '2026-07-20',
    booking_time: '10:00:00',
    service_id: 1,
    service_name: 'Haircut',
    staff_id: 2,
    staff_name: 'Alex',
    paid_amount: 50,
    payment_status: 'paid',
    rating: 5,
    first_booking_date: '2026-06-01',
    ...overrides,
  };
}

test('merchant insights calculate current metrics and nearest period comparison', () => {
  const period = resolveInsightPeriod('7d', new Date(2026, 6, 24));
  const rows = [
    row(),
    row({
      booking_id: 2,
      customer_id: 11,
      status: 'cancelled',
      booking_date: '2026-07-21',
      paid_amount: null,
      payment_status: null,
      rating: null,
      first_booking_date: '2026-07-21',
    }),
    row({
      booking_id: 3,
      booking_date: '2026-07-14',
      paid_amount: 40,
      rating: null,
    }),
  ];

  const result = buildMerchantInsights(rows, period);
  assert.equal(result.metrics.totalBookings, 1);
  assert.equal(result.metrics.revenue, 50);
  assert.equal(result.metrics.averageOrderValue, 50);
  assert.equal(result.metrics.cancelled, 1);
  assert.equal(result.metrics.uniqueCustomers, 2);
  assert.equal(result.metrics.newCustomers, 1);
  assert.equal(result.metrics.returningCustomers, 1);
  assert.equal(result.previous.totalBookings, 1);
  assert.equal(result.metrics.comparison.bookings, 0);
});

test('this-month insights compare elapsed month-to-date dates', () => {
  const period = resolveInsightPeriod('month', new Date(2026, 6, 24));
  assert.equal(period.startDate, '2026-07-01');
  assert.equal(period.endDate, '2026-07-24');
  assert.equal(period.previousStartDate, '2026-06-01');
  assert.equal(period.previousEndDate, '2026-06-24');
});

test('merchant insights page only loads the merchant id from the authenticated session', async () => {
  const originalIdentity = insightsModel.getMerchantInsightIdentity;
  const originalRows = insightsModel.getMerchantInsightRows;
  const originalOverallRating = insightsModel.getMerchantOverallRating;
  const captured = [];

  insightsModel.getMerchantInsightIdentity = async merchantId => {
    captured.push(merchantId);
    return { merchant_id: merchantId, merchant_name: 'Scoped Merchant' };
  };
  insightsModel.getMerchantInsightRows = async merchantId => {
    captured.push(merchantId);
    return [];
  };
  insightsModel.getMerchantOverallRating = async merchantId => {
    captured.push(merchantId);
    return { averageRating: 4.8, reviewCount: 12 };
  };

  try {
    const req = {
      session: { user: { merchant_id: 42, full_name: 'Merchant Owner' } },
      query: { period: '7d', merchantId: '999' },
    };
    const rendered = {};
    const res = {
      render(view, data) {
        rendered.view = view;
        rendered.data = data;
      },
      status() {
        return this;
      },
    };

    await merchantInsightsController.showInsights(req, res);
    assert.equal(rendered.view, 'merchant/insights');
    assert.deepEqual(captured, [42, 42, 42]);
    assert.equal(rendered.data.merchant.merchant_id, 42);
    assert.deepEqual(rendered.data.overallReview, { averageRating: 4.8, reviewCount: 12 });
  } finally {
    insightsModel.getMerchantInsightIdentity = originalIdentity;
    insightsModel.getMerchantInsightRows = originalRows;
    insightsModel.getMerchantOverallRating = originalOverallRating;
  }
});
