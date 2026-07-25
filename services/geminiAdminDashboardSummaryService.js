const { GoogleGenAI } = require('@google/genai');

const MODELS = [
  process.env.GEMINI_ADMIN_SUMMARY_MODEL,
  process.env.GEMINI_MODEL,
  'gemini-flash-latest',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
].filter(Boolean);

const responseSchema = {
  type: 'OBJECT',
  properties: {
    reportText: { type: 'STRING' },
  },
  required: ['reportText'],
};

function number(value) {
  return Number(value || 0);
}

function topRows(rows, fields, limit = 6) {
  return (rows || []).slice(0, limit).map(row => (
    fields.reduce((clean, field) => {
      clean[field] = row[field];
      return clean;
    }, {})
  ));
}

function buildCustomerPayload(analytics, range) {
  const overview = analytics.overview || {};
  const whatsapp = analytics.whatsappBookingSummary || {};

  return {
    period: range,
    dataBasis: {
      dateRange: 'Inclusive selected range.',
      customerAccounts: 'Customer account count is a current account snapshot, not a booking-period count.',
      bookingCounts: 'Booking totals and booking statuses are filtered by booking created date.',
      money: 'Spend, paid revenue, category totals, and average order value use paid payments within the selected range.',
      privacy: 'Customer names, emails, and phone numbers are excluded from this AI payload.',
    },
    overview: {
      totalCustomers: number(overview.total_customers),
      savedPaymentMethods: number(overview.saved_payment_methods),
      totalAmountSpent: number(overview.total_amount_spent),
      averageOrderValue: number(overview.average_order_value),
    },
    whatsappBookings: {
      totalBookings: number(whatsapp.total_bookings),
      customers: number(whatsapp.customers),
      paidRevenue: number(whatsapp.paid_revenue),
      averagePaidBooking: number(whatsapp.average_paid_booking),
      statusBreakdown: topRows(analytics.whatsappBookingStatus, ['status', 'total'], 8),
    },
    bookingStatus: topRows(analytics.bookingStatus, ['status', 'total'], 8),
    spendingCategories: topRows(analytics.spendingCategories, ['category', 'total'], 6),
    bookingFrequency: topRows(analytics.bookingFrequency, ['day_label', 'bookings'], 7),
    recommendedMerchants: topRows(analytics.recommendedMerchants, ['merchant_name', 'category', 'bookings', 'rating'], 6),
    suggestedServices: topRows(analytics.suggestedServices, ['service_name', 'category', 'bookings'], 6),
    promos: topRows(analytics.behaviourPromotions, ['campaign_name', 'voucher_code', 'discount_type', 'discount_value'], 6),
    reviews: analytics.reviewSummary || {},
    paymentMethods: topRows(analytics.paymentMethods, ['payment_method', 'total'], 6),
  };
}

function buildMerchantPayload(analytics, range) {
  const overview = analytics.overview || {};
  const financial = analytics.financial || {};
  const segments = analytics.customerSegments || {};
  const grossRevenue = number(financial.gross_revenue);
  const refundedAmount = number(financial.refunded_amount);
  const profitMargin = grossRevenue ? ((grossRevenue - refundedAmount) / grossRevenue) * 100 : 0;

  return {
    period: range,
    dataBasis: {
      dateRange: 'Inclusive selected range.',
      bookingCounts: 'Booking totals, statuses, customer counts, booking channels, and peak booking times are filtered by booking created date.',
      money: 'Revenue, category revenue, payment breakdown, top merchant revenue, top service revenue, AOV, tax, and profit margin use paid payments within the selected range.',
      privacy: 'Customer names, emails, and phone numbers are excluded from this AI payload.',
    },
    overview: {
      totalBookings: number(overview.total_bookings),
      revenueGenerated: number(overview.revenue_generated),
      customers: number(overview.number_of_customers),
      averageOrderValue: number(overview.average_order_value),
      bookingConversionRate: number(overview.booking_conversion_rate),
      cancellationNoShowRate: number(overview.cancellation_no_show_rate),
      satisfactionRating: number(overview.customer_satisfaction_rating),
    },
    financial: {
      profitMargin,
      refundedAmount: number(financial.refunded_amount),
      refundCount: number(financial.refund_count),
      estimatedTax: number(financial.estimated_tax),
    },
    customerSegments: segments,
    revenueByCategory: topRows(analytics.revenueByCategory, ['category', 'revenue'], 6),
    topServices: topRows(analytics.topServices, ['service_name', 'merchant_name', 'bookings', 'revenue'], 6),
    paymentBreakdown: topRows(analytics.paymentBreakdown, ['payment_method', 'total', 'revenue'], 6),
    promotionPerformance: topRows(analytics.promotionPerformance, ['campaign_name', 'voucher_code', 'redemptions'], 6),
    bookingStatus: topRows(analytics.bookingStatus, ['status', 'total'], 8),
    peakBookingTimes: topRows(analytics.peakBookingTimes, ['day_label', 'hour_label', 'bookings'], 6),
    topMerchants: topRows(analytics.topMerchants, ['merchant_name', 'category', 'bookings', 'customers', 'revenue', 'rating'], 6),
  };
}

function normalizeSummary(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('Gemini returned an invalid dashboard summary.');
  }

  const reportText = String(value.reportText || '').trim();

  if (!reportText) {
    throw new Error('Gemini returned an incomplete dashboard summary.');
  }

  return { reportText };
}

async function generateDashboardSummary({ dashboardType, analytics, range }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing.');
  }

  const isMerchant = dashboardType === 'merchant';
  const dashboardLabel = isMerchant ? 'Merchant Dashboard' : 'Customer Dashboard';
  const payload = isMerchant
    ? buildMerchantPayload(analytics, range)
    : buildCustomerPayload(analytics, range);

  const prompt = [
    `You are summarizing the Uniday ${dashboardLabel} for an admin.`,
    'Use only the aggregate database data in the JSON payload. Do not invent figures, dates, causes, customers, or merchants.',
    'Treat the period as an inclusive date range. Keep booking-count metrics separate from paid-money metrics when their basis differs.',
    'When discussing money, use wording such as paid revenue, paid spend, or paid payments so it is clear the figure is payment-based.',
    'Do not claim that every metric comes from identical records; say the metrics use the selected date range and the basis described in dataBasis.',
    'Do not include raw personal data, phone numbers, emails, or customer names.',
    'Write in the same style as an analyst report: short paragraphs, direct business implications, and exact figures from the payload.',
    'Return reportText as the full generated report, including these section headings: Data Summary, Descriptive Statistics, Business Insights, and Key Business Observations.',
    'Under Descriptive Statistics, include 3 to 5 bullets covering distribution, averages, medians, variance, trend, frequency, or concentration where the payload supports it.',
    'Under Business Insights, include 5 to 8 bullets. Start each bullet with a short label such as Customer Spending, Booking Performance, Service Performance, Payment Behaviour, Loyalty Programme, Customer Satisfaction, Revenue Performance, or Operational Demand.',
    'Do not include a Dashboard line, a Period line outside the narrative, or a Recommended Actions section.',
    'Mention WhatsApp booking signals when they are present in the customer dashboard payload.',
    JSON.stringify(payload),
  ].join('\n\n');

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let response;
  let lastError;

  for (const model of MODELS) {
    try {
      response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema,
          temperature: 0.2,
        },
      });
      break;
    } catch (err) {
      lastError = err;
      const message = String(err?.message || '');
      const status = Number(err?.status || err?.code || 0);
      const canTryNextModel = status === 404
        || status === 400
        || /not found|not available|not supported|model/i.test(message);
      if (!canTryNextModel) throw err;
    }
  }

  if (!response && lastError) throw lastError;

  if (!response.text) throw new Error('Gemini returned no dashboard summary.');
  const parsed = normalizeSummary(JSON.parse(response.text));

  return {
    ...parsed,
    text: parsed.reportText,
  };
}

module.exports = {
  generateDashboardSummary,
};
