const notificationModel = require('../models/notificationModel');

function buildAssistantReply(question, user) {
  const text = String(question || '').toLowerCase();
  const name = user.full_name ? user.full_name.split(' ')[0] : 'there';

  if (text.includes('cancel')) {
    return `Hi ${name}, you can cancel an eligible booking from My Bookings. Open View bookings, choose the booking, then select Cancel. If the merchant has a cancellation policy, the app will check it before cancelling.`;
  }

  if (text.includes('reschedule') || text.includes('change time') || text.includes('change date')) {
    return `Hi ${name}, you can reschedule from My Bookings. Pick the booking, select Reschedule, then choose a new available date and time.`;
  }

  if (text.includes('pay') || text.includes('payment') || text.includes('checkout')) {
    return `Hi ${name}, pending bookings can be paid from the checkout page or from My Bookings. Once payment succeeds, I will send a confirmation here automatically.`;
  }

  if (text.includes('confirm') || text.includes('confirmed')) {
    return `Hi ${name}, confirmed bookings appear in My Bookings after payment is completed. I also send a confirmation message here when payment succeeds.`;
  }

  if (text.includes('booking') || text.includes('appointment')) {
    return `Hi ${name}, you can view all your appointments from View bookings. I will also message you here when bookings are created, confirmed, cancelled, or rescheduled.`;
  }

  if (text.includes('loyalty') || text.includes('point') || text.includes('wallet') || text.includes('voucher')) {
    return `Hi ${name}, open Wallet to view loyalty points, vouchers, and recent reward activity. Paid bookings can earn loyalty points automatically.`;
  }

  if (text.includes('merchant') || text.includes('business')) {
    return `Hi ${name}, merchant users can manage services, availability, promotions, staff, and bookings from the merchant dashboard after approval.`;
  }

  if (text.includes('hello') || text.includes('hi') || text.includes('help')) {
    return `Hi ${name}, I can help with booking, payment, cancellation, rescheduling, loyalty wallet, and account questions.`;
  }

  return `Hi ${name}, I can help with booking, payment, cancellation, rescheduling, loyalty wallet, and account questions. Try asking something like "How do I cancel my booking?"`;
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
      error: 'Could not load notifications.',
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
    res.redirect('/assistant?success=Messages marked as read.');
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
        return res.status(400).json({ error: 'Please type a question.' });
      }
      return res.redirect('/assistant?error=' + encodeURIComponent('Please type a question.'));
    }

    const answer = buildAssistantReply(question, req.session.user);
    await notificationModel.createAssistantExchange(req.session.user.user_id, question, answer);

    if (req.xhr || req.get('Accept')?.includes('application/json')) {
      return res.json({ question, answer });
    }

    res.redirect('/assistant');
  } catch (err) {
    console.error('assistant question failed:', err);
    if (req.xhr || req.get('Accept')?.includes('application/json')) {
      return res.status(500).json({ error: 'Assistant could not reply right now.' });
    }
    res.redirect('/assistant?error=' + encodeURIComponent('Assistant could not reply right now.'));
  }
}

module.exports = {
  listNotifications,
  markRead,
  markAllRead,
  askAssistant,
};
