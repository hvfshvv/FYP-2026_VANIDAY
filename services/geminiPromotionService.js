const { GoogleGenAI } = require('@google/genai');

const GEMINI_PROMOTION_MODEL = process.env.GEMINI_PROMOTION_MODEL
  || process.env.GEMINI_MODEL
  || 'gemini-3.6-flash';
const DAY_VALUES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const promotionSuggestionSchema = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    offerText: { type: 'STRING' },
    description: { type: 'STRING' },
    discountPct: { type: 'NUMBER' },
    minSpend: { type: 'NUMBER' },
    startDate: { type: 'STRING' },
    endDate: { type: 'STRING' },
    applicableDays: {
      type: 'ARRAY',
      items: {
        type: 'STRING',
        format: 'enum',
        enum: DAY_VALUES,
      },
    },
    serviceId: { type: 'INTEGER' },
    reason: { type: 'STRING' },
  },
  required: [
    'title',
    'offerText',
    'description',
    'discountPct',
    'minSpend',
    'startDate',
    'endDate',
    'applicableDays',
    'serviceId',
    'reason',
  ],
};

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function buildPromotionPrompt({ merchantName, services, goal, season, currentForm }) {
  const serviceLines = services.length
    ? services.map(service => `- ${service.service_id}: ${service.service_name}`).join('\n')
    : '- No specific services listed';

  return `
You are generating one merchant promotion request for Uniday.

Context:
- Uniday is a Singapore appointment-booking marketplace for beauty, wellness, fitness and service merchants.
- A merchant submits promotion requests for admin approval before they appear on the marketplace.
- The existing merchant promotion form supports percent discounts only.
- Do not suggest unsupported mechanics such as buy-one-get-one, free gifts, bundles that require extra booking logic, loyalty points, or voucher codes.
- Keep the promotion practical, customer-facing, and suitable for admin approval.
- Do not create or save anything.

Merchant:
- Name: ${merchantName || 'Merchant'}
- Services:
${serviceLines}

Merchant inputs:
- Goal: ${goal || 'Not provided'}
- Occasion or season: ${season || 'Not provided'}
- Current form title: ${currentForm.title || 'Blank'}
- Current offer text: ${currentForm.offerText || 'Blank'}
- Current description: ${currentForm.description || 'Blank'}
- Current service id: ${currentForm.serviceId || 'All services'}
- Current discount percent: ${currentForm.discountPct || 'Blank'}
- Current minimum spend: ${currentForm.minSpend || 'Blank'}
- Current start date: ${currentForm.startDate || 'Blank'}
- Current end date: ${currentForm.endDate || 'Blank'}

Return exactly these fields:
title, offerText, description, discountPct, minSpend, startDate, endDate, applicableDays, serviceId, reason.

Rules:
- Today is ${todayInput()}.
- title must be 5 to 80 characters.
- offerText must be 5 to 120 characters and directly state the discount.
- description must be 20 to 240 characters.
- discountPct must be between 5 and 40.
- minSpend must be 0 or greater. Use 0 when no minimum spend is needed.
- startDate and endDate must use YYYY-MM-DD.
- startDate cannot be before today.
- endDate cannot be before startDate.
- Campaign length should normally be 7 to 45 days.
- applicableDays must contain zero or more of: ${DAY_VALUES.join(', ')}. Use [] for every day.
- serviceId must be one of the listed service IDs, or 0 for all services.
- reason should be one concise sentence for the merchant.
`.trim();
}

function requireField(suggestion, field) {
  if (!Object.prototype.hasOwnProperty.call(suggestion, field)) {
    throw new Error(`Gemini returned a promotion suggestion missing ${field}.`);
  }
}

function roundToTwo(value) {
  return Math.round(value * 100) / 100;
}

function parseFiniteNumber(value, message) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(message);
  return parsed;
}

function isRealDateInput(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function validateAndNormalizeSuggestion(suggestion, services) {
  if (!suggestion || typeof suggestion !== 'object' || Array.isArray(suggestion)) {
    throw new Error('Gemini returned an invalid promotion suggestion.');
  }

  [
    'title',
    'offerText',
    'description',
    'discountPct',
    'minSpend',
    'startDate',
    'endDate',
    'applicableDays',
    'serviceId',
    'reason',
  ].forEach(field => requireField(suggestion, field));

  const title = String(suggestion.title || '').trim();
  if (title.length < 5 || title.length > 80) {
    throw new Error('Gemini returned an invalid promotion title.');
  }

  const offerText = String(suggestion.offerText || '').trim();
  if (offerText.length < 5 || offerText.length > 120) {
    throw new Error('Gemini returned an invalid offer text.');
  }

  const description = String(suggestion.description || '').trim();
  if (description.length < 20 || description.length > 240) {
    throw new Error('Gemini returned an invalid promotion description.');
  }

  const discountPct = roundToTwo(parseFiniteNumber(
    suggestion.discountPct,
    'Gemini returned an invalid discount percentage.'
  ));
  if (discountPct < 1 || discountPct > 100) {
    throw new Error('Gemini returned an invalid discount percentage.');
  }

  const minSpend = roundToTwo(parseFiniteNumber(
    suggestion.minSpend,
    'Gemini returned an invalid minimum spend.'
  ));
  if (minSpend < 0) {
    throw new Error('Gemini returned an invalid minimum spend.');
  }

  const { startDate, endDate } = suggestion;
  if (!isRealDateInput(startDate) || !isRealDateInput(endDate)) {
    throw new Error('Gemini returned an invalid promotion date.');
  }
  if (Date.parse(`${endDate}T00:00:00Z`) < Date.parse(`${startDate}T00:00:00Z`)) {
    throw new Error('Gemini returned an invalid promotion date range.');
  }

  const applicableDays = Array.isArray(suggestion.applicableDays)
    ? suggestion.applicableDays.filter(day => DAY_VALUES.includes(day))
    : [];

  const serviceIds = new Set(services.map(service => Number(service.service_id)));
  const serviceId = Number.parseInt(suggestion.serviceId, 10);
  const normalizedServiceId = serviceIds.has(serviceId) ? serviceId : 0;

  const reason = String(suggestion.reason || '').trim();
  if (!reason || reason.length > 240) {
    throw new Error('Gemini returned an invalid promotion reason.');
  }

  return {
    title,
    offerText,
    description,
    discountPct,
    minSpend,
    startDate,
    endDate,
    applicableDays,
    serviceId: normalizedServiceId,
    reason,
  };
}

async function generatePromotionSuggestion({ merchantName, services = [], goal, season, currentForm = {} }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing. Set it before generating promotion suggestions.');
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: GEMINI_PROMOTION_MODEL,
    contents: buildPromotionPrompt({ merchantName, services, goal, season, currentForm }),
    config: {
      responseMimeType: 'application/json',
      responseSchema: promotionSuggestionSchema,
    },
  });

  if (!response.text || !response.text.trim()) {
    throw new Error('Gemini returned no promotion suggestion text.');
  }

  try {
    const parsed = JSON.parse(response.text);
    return validateAndNormalizeSuggestion(parsed, services);
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error('Gemini returned invalid promotion suggestion JSON.');
    }
    throw err;
  }
}

module.exports = {
  generatePromotionSuggestion,
};
