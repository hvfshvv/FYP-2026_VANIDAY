function previewText(text) {
  return String(text || '').split('\n').filter(Boolean).slice(0, 8).join('\n');
}

function createNoopEmailProvider({ logger = console } = {}) {
  return {
    name: 'noop',
    canDeliver: false,
    async send({ to, subject, text, logLabel }) {
      logger.log([
        `[email:noop] ${logLabel || 'Email'} skipped`,
        `To: ${to}`,
        `Subject: ${subject}`,
        previewText(text),
      ].filter(Boolean).join('\n'));

      return {
        sent: false,
        skipped: true,
        provider: 'noop',
        reason: 'EMAIL_PROVIDER_NOOP',
      };
    },
  };
}

module.exports = {
  createNoopEmailProvider,
};
