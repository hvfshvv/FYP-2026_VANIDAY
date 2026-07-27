const fs = require('fs');
const path = require('path');

const DEFAULT_LANGUAGE = 'en';
const SUPPORTED_LANGUAGES = ['en', 'ms', 'zh', 'ta'];
const LANGUAGE_LABELS = {
  en: 'English',
  ms: 'Bahasa Melayu',
  zh: '\u7b80\u4f53\u4e2d\u6587',
  ta: '\u0ba4\u0bae\u0bbf\u0bb4\u0bcd',
};

const localeDir = path.join(__dirname, '..', 'locales');
const shouldReloadLocales = process.env.NODE_ENV !== 'production';

function loadLocale(lang) {
  const filePath = path.join(localeDir, `${lang}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const dictionaries = SUPPORTED_LANGUAGES.reduce((acc, lang) => {
  acc[lang] = loadLocale(lang);
  return acc;
}, {});

function reloadDictionaries() {
  if (!shouldReloadLocales) return;

  SUPPORTED_LANGUAGES.forEach(lang => {
    dictionaries[lang] = loadLocale(lang);
  });
}

function normalizeLanguage(value) {
  const raw = String(value || '').toLowerCase().trim();
  if (!raw) return DEFAULT_LANGUAGE;
  if (raw.startsWith('zh')) return 'zh';
  if (raw.startsWith('ms') || raw.startsWith('ms-my')) return 'ms';
  if (raw.startsWith('ta')) return 'ta';
  if (raw.startsWith('en')) return 'en';
  return DEFAULT_LANGUAGE;
}

function readCookie(header, name) {
  return String(header || '')
    .split(';')
    .map(part => part.trim())
    .reduce((found, part) => {
      if (found) return found;
      const separator = part.indexOf('=');
      if (separator === -1) return null;
      const key = part.slice(0, separator);
      if (key !== name) return null;
      return decodeURIComponent(part.slice(separator + 1));
    }, null);
}

function getNested(source, key) {
  return String(key || '')
    .split('.')
    .filter(Boolean)
    .reduce((value, part) => (value && Object.prototype.hasOwnProperty.call(value, part) ? value[part] : undefined), source);
}

function interpolate(value, params = {}) {
  return String(value).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, name) => {
    if (params[name] === undefined || params[name] === null) return '';
    return String(params[name]);
  });
}

function isInvalidTranslationValue(value) {
  if (typeof value !== 'string') return false;
  const withoutPlaceholders = value
    .replace(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g, '')
    .replace(/[A-Za-z0-9$#%&/.:+\-(),'"`]/g, '')
    .trim();

  return withoutPlaceholders.length > 0 && /^[?\s]+$/.test(withoutPlaceholders);
}

function t(lang, key, params = {}, fallbackText) {
  reloadDictionaries();
  const normalized = normalizeLanguage(lang);
  const localizedValue = getNested(dictionaries[normalized], key);
  const fallbackValue = getNested(dictionaries[DEFAULT_LANGUAGE], key);
  const value = localizedValue !== undefined && localizedValue !== null && !isInvalidTranslationValue(localizedValue)
    ? localizedValue
    : (fallbackValue ?? fallbackText ?? key);
  return interpolate(value, params);
}

function toServiceKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function serviceText(lang, service, field = 'name') {
  reloadDictionaries();
  if (!service) return '';
  const normalized = normalizeLanguage(lang);
  const idKey = service.service_id ? `services.byId.${service.service_id}.${field}` : '';
  const nameKey = `services.byName.${toServiceKey(service.service_name)}.${field}`;
  const byId = idKey ? getNested(dictionaries[normalized], idKey) ?? getNested(dictionaries[DEFAULT_LANGUAGE], idKey) : null;
  const byName = getNested(dictionaries[normalized], nameKey) ?? getNested(dictionaries[DEFAULT_LANGUAGE], nameKey);

  if (byId && !isInvalidTranslationValue(byId)) return byId;
  if (byName && !isInvalidTranslationValue(byName)) return byName;
  if (field === 'description') return service.description || '';
  return service.service_name || '';
}

function getClientDictionary(lang) {
  reloadDictionaries();
  const normalized = normalizeLanguage(lang);
  return {
    lang: normalized,
    supported: SUPPORTED_LANGUAGES,
    labels: LANGUAGE_LABELS,
    translations: dictionaries[normalized],
    fallback: dictionaries[DEFAULT_LANGUAGE],
  };
}

module.exports = {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  LANGUAGE_LABELS,
  dictionaries,
  normalizeLanguage,
  readCookie,
  t,
  serviceText,
  getClientDictionary,
  isInvalidTranslationValue,
};
