const nodemailer = require('nodemailer');

function createSmtpEmailProvider({ config, logger = console }) {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  return {
    name: 'smtp',
    canDeliver: true,
    async send({ from, to, subject, text, html }) {
      const info = await transporter.sendMail({ from, to, subject, text, html });
      const accepted = (info.accepted || []).map(value => String(value || '').trim().toLowerCase());
      const rejected = (info.rejected || []).map(value => String(value || '').trim().toLowerCase());
      const recipient = String(to || '').trim().toLowerCase();

      if (!accepted.includes(recipient) || rejected.includes(recipient)) {
        logger.error('[email:smtp] recipient rejected', {
          to: recipient,
          subject,
          accepted: info.accepted,
          rejected: info.rejected,
          response: info.response,
        });

        return {
          sent: false,
          provider: 'smtp',
          reason: 'RECIPIENT_REJECTED',
          accepted: info.accepted,
          rejected: info.rejected,
        };
      }

      if (config.debug) {
        logger.log('[email:smtp] sent', {
          to: recipient,
          subject,
          messageId: info.messageId,
          accepted: info.accepted,
          rejected: info.rejected,
          response: info.response,
        });
      }

      return {
        sent: true,
        provider: 'smtp',
        accepted: info.accepted,
        rejected: info.rejected,
      };
    },
  };
}

module.exports = {
  createSmtpEmailProvider,
};
