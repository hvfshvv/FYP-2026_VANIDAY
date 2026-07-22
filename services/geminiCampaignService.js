const { GoogleGenAI } = require('@google/genai');

const GEMINI_CAMPAIGN_MODEL = process.env.GEMINI_CAMPAIGN_MODEL
  || process.env.GEMINI_MODEL
  || 'gemini-3.6-flash';

const campaignRecommendationSchema = {
  type: 'OBJECT',
  properties: {
    campaignName: { type: 'STRING' },
    voucherCode: { type: 'STRING' },
    discountType: {
      type: 'STRING',
      format: 'enum',
      enum: ['percent', 'fixed'],
    },
    discountValue: { type: 'NUMBER' },
    minSpend: { type: 'NUMBER' },
    usageLimit: { type: 'INTEGER' },
    perCustomer: { type: 'INTEGER' },
    startDate: { type: 'STRING' },
    endDate: { type: 'STRING' },
    reason: { type: 'STRING' },
  },
  required: [
    'campaignName',
    'voucherCode',
    'discountType',
    'discountValue',
    'minSpend',
    'usageLimit',
    'perCustomer',
    'startDate',
    'endDate',
    'reason',
  ],
};

function buildCampaignPrompt({ occasion, eventDate, goal }) {
  return `
You are generating an admin campaign recommendation for Uniday.

Context:
- Uniday is a Singapore multi-merchant service-booking platform.
- It includes businesses such as beauty salons, wellness providers, fitness services and appointment-based merchants.
- The recommendation is a platform-wide voucher that can be used across participating merchants.
- The admin provides the occasion, event date and campaign goal.
- Generate exactly one practical voucher recommendation.
- The existing voucher system only supports percent and fixed discounts.
- Do not suggest buy-one-get-one, free gifts, loyalty points or other unsupported reward types.
- Do not create or save anything to the database.

Admin inputs:
- Occasion: ${occasion || 'Not provided'}
- Event date: ${eventDate || 'Not provided'}
- Campaign goal: ${goal || 'Not provided'}

Return exactly these fields:
campaignName, voucherCode, discountType, discountValue, minSpend, usageLimit, perCustomer, startDate, endDate, reason.

Rules:
- voucherCode must contain only uppercase letters and numbers.
- voucherCode should be 5 to 15 characters.
- discountType must be either "percent" or "fixed".
- Percent discounts should normally be between 5 and 40.
- Fixed discounts should normally be between S$5 and S$50.
- minSpend must be 0 or greater.
- usageLimit must be a positive integer.
- perCustomer must be a positive integer and must not exceed usageLimit.
- startDate and endDate must use YYYY-MM-DD.
- The campaign should generally begin several days before the event.
- endDate must be on or shortly after the event date.
- reason should be one or two concise sentences suitable for the admin dashboard.
`.trim();
}

function requireField(recommendation, field) {
  if (!Object.prototype.hasOwnProperty.call(recommendation, field)) {
    throw new Error(`Gemini returned a recommendation missing ${field}.`);
  }
}

function roundToTwo(value) {
  return Math.round(value * 100) / 100;
}

function parseFiniteNumber(value, errorMessage) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(errorMessage);
  }
  return parsed;
}

function parsePositiveInteger(value, errorMessage) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(errorMessage);
  }
  return parsed;
}

function isRealDateInput(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function validateAndNormalizeRecommendation(recommendation) {
  if (!recommendation || typeof recommendation !== 'object' || Array.isArray(recommendation)) {
    throw new Error('Gemini returned an invalid campaign recommendation.');
  }

  const requiredFields = [
    'campaignName',
    'voucherCode',
    'discountType',
    'discountValue',
    'minSpend',
    'usageLimit',
    'perCustomer',
    'startDate',
    'endDate',
    'reason',
  ];

  requiredFields.forEach(field => requireField(recommendation, field));

  if (typeof recommendation.campaignName !== 'string') {
    throw new Error('Gemini returned an invalid campaign name.');
  }
  const campaignName = recommendation.campaignName.trim();
  if (!campaignName || campaignName.length > 100) {
    throw new Error('Gemini returned an invalid campaign name.');
  }

  const voucherCode = String(recommendation.voucherCode || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z0-9]{5,15}$/.test(voucherCode)) {
    throw new Error('Gemini returned an invalid voucher code.');
  }

  const discountType = String(recommendation.discountType || '').toLowerCase();
  if (!['percent', 'fixed'].includes(discountType)) {
    throw new Error('Gemini returned an invalid discount type.');
  }

  const discountValue = roundToTwo(parseFiniteNumber(
    recommendation.discountValue,
    'Gemini returned an invalid discount value.'
  ));
  if (discountValue <= 0
    || (discountType === 'percent' && discountValue > 100)
    || (discountType === 'fixed' && discountValue > 1000)) {
    throw new Error('Gemini returned an invalid discount value.');
  }

  const minSpend = roundToTwo(parseFiniteNumber(
    recommendation.minSpend,
    'Gemini returned an invalid minimum spend.'
  ));
  if (minSpend < 0) {
    throw new Error('Gemini returned an invalid minimum spend.');
  }

  const usageLimit = parsePositiveInteger(
    recommendation.usageLimit,
    'Gemini returned an invalid usage limit.'
  );
  const perCustomer = parsePositiveInteger(
    recommendation.perCustomer,
    'Gemini returned an invalid per-customer limit.'
  );
  if (perCustomer > usageLimit) {
    throw new Error('Gemini returned an invalid per-customer limit.');
  }

  const { startDate, endDate } = recommendation;
  if (!isRealDateInput(startDate) || !isRealDateInput(endDate)) {
    throw new Error('Gemini returned an invalid campaign date.');
  }
  if (Date.parse(`${endDate}T00:00:00Z`) < Date.parse(`${startDate}T00:00:00Z`)) {
    throw new Error('Gemini returned an invalid campaign date range.');
  }

  if (typeof recommendation.reason !== 'string') {
    throw new Error('Gemini returned an invalid recommendation reason.');
  }
  const reason = recommendation.reason.trim();
  if (!reason || reason.length > 300) {
    throw new Error('Gemini returned an invalid recommendation reason.');
  }

  return {
    campaignName,
    voucherCode,
    discountType,
    discountValue,
    minSpend,
    usageLimit,
    perCustomer,
    startDate,
    endDate,
    reason,
  };
}

async function generateCampaignRecommendation({ occasion, eventDate, goal }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing. Set it before generating campaign recommendations.');
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const response = await ai.models.generateContent({
    model: GEMINI_CAMPAIGN_MODEL,
    contents: buildCampaignPrompt({ occasion, eventDate, goal }),
    config: {
      responseMimeType: 'application/json',
      responseSchema: campaignRecommendationSchema,
    },
  });

  if (!response.text || !response.text.trim()) {
    throw new Error('Gemini returned no campaign recommendation text.');
  }

  try {
    const parsed = JSON.parse(response.text);
    return validateAndNormalizeRecommendation(parsed);
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error('Gemini returned invalid campaign recommendation JSON.');
    }
    throw err;
  }
}

module.exports = {
  generateCampaignRecommendation,
};
