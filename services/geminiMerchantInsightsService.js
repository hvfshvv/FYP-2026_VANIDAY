const { GoogleGenAI } = require('@google/genai');

const MODEL = process.env.GEMINI_MERCHANT_INSIGHTS_MODEL
  || process.env.GEMINI_MODEL
  || 'gemini-2.5-flash';

const responseSchema = {
  type: 'OBJECT',
  properties: {
    summary: {
      type: 'STRING',
      description: 'Plain-English overview of no more than 25 words.',
    },
    actions: {
      type: 'ARRAY',
      description: 'Exactly four short, practical actions.',
      items: {
        type: 'OBJECT',
        properties: {
          priority: { type: 'STRING', format: 'enum', enum: ['high', 'medium', 'low'] },
          title: { type: 'STRING', description: 'Action heading of no more than 6 words.' },
          evidence: { type: 'STRING', description: 'One plain-English evidence sentence of no more than 18 words.' },
          action: { type: 'STRING', description: 'One specific operational step of no more than 22 words.' },
        },
        required: ['priority', 'title', 'evidence', 'action'],
      },
    },
  },
  required: ['summary', 'actions'],
};

function cleanWords(value, maxWords, maxLength) {
  const normalized = String(value || '')
    .replace(/\bCRM(?:\s+tool)?\b/gi, 'customer list')
    .replace(/\bKPIs?\b/gi, 'results')
    .replace(/\bconversion funnel\b/gi, 'booking journey')
    .replace(/\bcustomer segmentation\b/gi, 'customer groups')
    .replace(/\bsegmentation\b/gi, 'grouping')
    .replace(/\bworkflows?\b/gi, 'routine')
    .replace(/\boptimis(?:e|ation|ing)\b/gi, 'improve')
    .replace(/\bleverag(?:e|ing)\b/gi, 'use')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return '';
  const words = normalized.split(' ');
  let result = words.slice(0, maxWords).join(' ');
  if (result.length > maxLength) {
    result = result.slice(0, maxLength);
    result = result.slice(0, Math.max(result.lastIndexOf(' '), 0)).trim();
  }
  return result.replace(/[,:;\-–—\s]+$/, '').trim();
}

function validatePlan(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.actions)) {
    throw new Error('Gemini returned an invalid merchant action plan.');
  }
  const summary = cleanWords(value.summary, 25, 220);
  const actions = value.actions.slice(0, 4).map(item => {
    const priority = ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium';
    const normalized = {
      priority,
      title: cleanWords(item.title, 6, 70),
      evidence: cleanWords(item.evidence, 18, 160),
      action: cleanWords(item.action, 22, 190),
    };
    if (!normalized.title || !normalized.evidence || !normalized.action) {
      throw new Error('Gemini returned an incomplete merchant action.');
    }
    return normalized;
  });
  if (!summary || !actions.length) throw new Error('Gemini returned an empty merchant action plan.');
  return { summary, actions };
}

async function generateMerchantActionPlan({ merchantName, period, metrics, recommendations }) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing.');

  const safePayload = {
    period: period.label,
    totalBookings: metrics.totalBookings,
    revenue: metrics.revenue,
    averageOrderValue: metrics.averageOrderValue,
    completed: metrics.completed,
    cancelled: metrics.cancelled,
    noShow: metrics.noShow,
    cancellationNoShowRate: metrics.cancellationNoShowRate,
    uniqueCustomers: metrics.uniqueCustomers,
    newCustomers: metrics.newCustomers,
    returningCustomers: metrics.returningCustomers,
    retentionRate: metrics.retentionRate,
    averageRating: metrics.averageRating,
    reviewCount: metrics.reviewCount,
    topServices: metrics.servicePerformance.slice(0, 4),
    peakDemand: metrics.demandPeriods.slice(0, 4),
    existingRuleBasedActionTitles: recommendations.map(item => item.title),
  };

  const prompt = [
    `You are a practical business coach for ${merchantName}.`,
    'Create a concise complementary weekly action plan using only the aggregate figures in the JSON below.',
    'Do not invent customers, causes, percentages, forecasts, or external benchmarks.',
    'Do not repeat, paraphrase, or lightly reword anything listed in existingRuleBasedActionTitles.',
    'The rule-based actions are already displayed elsewhere, so find different insights by combining at least two supplied metrics.',
    'Return exactly four different actions when there is enough evidence.',
    'Use everyday language suitable for a salon owner. Never use CRM, KPI, conversion funnel, segmentation, optimisation, leverage, or similar business jargon.',
    'Prefer hands-on operational actions about staff rosters, appointment timing, service preparation, simple promotions, customer follow-up, and review requests.',
    'Each action must tell the merchant one thing to do next. Keep any measurable target simple and realistic.',
    'Keep the summary under 25 words, each title under 6 words, evidence under 18 words, and action under 22 words.',
    'Treat small samples cautiously. If the evidence is insufficient, recommend a specific measurement or data-collection action.',
    'Do not include personal data; none has been supplied.',
    JSON.stringify(safePayload),
  ].join('\n\n');

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema,
      temperature: 0.2,
    },
  });
  if (!response.text) throw new Error('Gemini returned no merchant action plan.');
  const plan = validatePlan(JSON.parse(response.text));
  if (metrics.totalBookings < 5) {
    return {
      summary: `Early indication based on only ${metrics.totalBookings} booking${metrics.totalBookings === 1 ? '' : 's'}. ${plan.summary}`,
      actions: plan.actions.slice(0, 2).map(action => ({ ...action, priority: 'low' })),
    };
  }
  return plan;
}

module.exports = { generateMerchantActionPlan, validatePlan };
