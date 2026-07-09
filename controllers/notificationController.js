const notificationModel = require('../models/notificationModel');
const { t } = require('../utils/i18n');

function buildAssistantReply(question, user, lang = 'en') {
  const text = String(question || '').toLowerCase();
  const name = user.full_name ? user.full_name.split(' ')[0] : t(lang, 'assistantReplies.there');

  if (text.includes('cancel')) {
    return t(lang, 'assistantReplies.cancel', { name });
  }

  if (text.includes('reschedule') || text.includes('change time') || text.includes('change date')) {
    return t(lang, 'assistantReplies.reschedule', { name });
  }

  if (text.includes('pay') || text.includes('payment') || text.includes('checkout')) {
    return t(lang, 'assistantReplies.payment', { name });
  }

  if (text.includes('confirm') || text.includes('confirmed')) {
    return t(lang, 'assistantReplies.confirm', { name });
  }

  if (text.includes('booking') || text.includes('appointment')) {
    return t(lang, 'assistantReplies.booking', { name });
  }

  if (text.includes('loyalty') || text.includes('point') || text.includes('wallet') || text.includes('voucher')) {
    return t(lang, 'assistantReplies.loyalty', { name });
  }

  if (text.includes('merchant') || text.includes('business')) {
    return t(lang, 'assistantReplies.merchant', { name });
  }

  if (text.includes('hello') || text.includes('hi') || text.includes('help')) {
    return t(lang, 'assistantReplies.help', { name });
  }

  return t(lang, 'assistantReplies.fallback', { name });
}

async function listNotifications(req, res) {
  try {
    const notifications = await notificationModel.getNotificationsForUser(req.session.user.user_id);

    res.render('notifications/index', {
      title: 'Uniday Assistant',
      notifications,
      success: req.query.success || null,
      error: null,
      query: req.query,
    });
  } catch (err) {
    console.error('notifications load failed:', err);
    res.render('notifications/index', {
      title: 'Uniday Assistant',
      notifications: [],
      success: null,
      error: res.locals.t('assistantReplies.loadError'),
      query: req.query,
    });
  }
}

async function markRead(req, res) {
  try {
    await notificationModel.markNotificationRead(req.params.notificationId, req.session.user.user_id);
  } catch (err) {
    console.error('notification mark-read failed:', err);
  }

  res.redirect('/assistant');
}

async function markAllRead(req, res) {
  try {
    await notificationModel.markAllRead(req.session.user.user_id);
    res.redirect('/assistant?success=' + encodeURIComponent(res.locals.t('assistantReplies.markedRead')));
  } catch (err) {
    console.error('notification mark-all-read failed:', err);
    res.redirect('/assistant');
  }
}

async function askAssistant(req, res) {
  const question = String(req.body.question || '').trim();

  try {
    if (!question) {
      if (req.xhr || req.get('Accept')?.includes('application/json')) {
        return res.status(400).json({ error: res.locals.t('assistantReplies.typeQuestion') });
      }
      return res.redirect('/assistant?error=' + encodeURIComponent(res.locals.t('assistantReplies.typeQuestion')));
    }

    const answer = buildAssistantReply(question, req.session.user, req.language);
    await notificationModel.createAssistantExchange(req.session.user.user_id, question, answer);

    if (req.xhr || req.get('Accept')?.includes('application/json')) {
      return res.json({ question, answer });
    }

    res.redirect('/assistant');
  } catch (err) {
    console.error('assistant question failed:', err);
    if (req.xhr || req.get('Accept')?.includes('application/json')) {
      return res.status(500).json({ error: res.locals.t('assistantReplies.replyError') });
    }
    res.redirect('/assistant?error=' + encodeURIComponent(res.locals.t('assistantReplies.replyError')));
  }
}

module.exports = {
  listNotifications,
  markRead,
  markAllRead,
  askAssistant,
};
