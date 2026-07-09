const {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  LANGUAGE_LABELS,
  getClientDictionary,
  normalizeLanguage,
  readCookie,
  serviceText,
  t,
} = require('../utils/i18n');

function detectLanguage(req) {
  const queryLang = req.query && req.query.lang;
  if (queryLang) return normalizeLanguage(queryLang);

  const cookieLang = readCookie(req.headers.cookie, 'uniday_lang');
  if (cookieLang) return normalizeLanguage(cookieLang);

  const accepted = String(req.headers['accept-language'] || '').split(',')[0];
  if (accepted) return normalizeLanguage(accepted);

  return DEFAULT_LANGUAGE;
}

module.exports = function i18nMiddleware(req, res, next) {
  const lang = detectLanguage(req);

  if (req.query && req.query.lang) {
    res.cookie('uniday_lang', lang, {
      maxAge: 1000 * 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
  }

  if (req.session && req.session.user) {
    req.session.user.preferred_language = lang;
  }

  req.language = lang;
  res.locals.lang = lang;
  res.locals.supportedLanguages = SUPPORTED_LANGUAGES;
  res.locals.languageLabels = LANGUAGE_LABELS;
  res.locals.t = (key, params, fallbackText) => t(lang, key, params, fallbackText);
  res.locals.serviceText = (service, field) => serviceText(lang, service, field);
  res.locals.i18nClient = getClientDictionary(lang);

  next();
};
