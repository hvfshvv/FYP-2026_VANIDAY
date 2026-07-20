const notificationModel = require('../models/notificationModel');
const bookingNotificationModel = require('../models/bookingNotificationModel');
const waitlistModel = require('../models/waitlistModel');

async function listNotifications(req, res) {
  try {
    await bookingNotificationModel.expirePendingPaymentBookings();
    await waitlistModel.expireOffersAndPromote();
    const notifications = await notificationModel.getNotificationsForUser(req.session.user.user_id);
    const unreadIds = notifications
      .filter(notification => !notification.is_read)
      .map(notification => notification.id);

    if (unreadIds.length) {
      await notificationModel.markNotificationsRead(unreadIds, req.session.user.user_id);
    }

    res.render('notifications/index', {
      title: 'Notifications',
      notifications,
      success: req.query.success || null,
      error: null,
      query: req.query,
    });
  } catch (err) {
    console.error('notifications load failed:', err);
    res.render('notifications/index', {
      title: 'Notifications',
      notifications: [],
      success: null,
      error: 'Could not load notifications. Please try again.',
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

  res.redirect('/notifications');
}

async function markAllRead(req, res) {
  try {
    await notificationModel.markAllRead(req.session.user.user_id);
    res.redirect('/notifications?success=' + encodeURIComponent('Messages marked as read.'));
  } catch (err) {
    console.error('notification mark-all-read failed:', err);
    res.redirect('/notifications');
  }
}

module.exports = {
  listNotifications,
  markRead,
  markAllRead,
};
