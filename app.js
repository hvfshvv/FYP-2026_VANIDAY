require('dotenv').config();
const express    = require('express');
const session    = require('express-session');
const path       = require('path');

const authRoutes        = require('./routes/auth');
const merchantRoutes    = require('./routes/merchant');
const adminRoutes       = require('./routes/admin');
const bookingRoutes     = require('./routes/booking');
const paymentRoutes     = require('./routes/paymentRoutes');
const paymentController = require('./controllers/paymentController');
const marketplaceRoutes = require('./routes/marketplace');
const whatsappRoutes    = require('./routes/whatsapp');
const favouriteRoutes   = require('./routes/favourite');
const loyaltyRoutes     = require('./routes/loyalty');
const notificationRoutes = require('./routes/notifications');
const reminderService   = require('./services/reminderService');
const bookingModel      = require('./models/bookingModel');
const notificationModel = require('./models/notificationModel');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Stripe webhook must read the raw request body before JSON parsing.
app.post('/payment/webhook', express.raw({ type: 'application/json' }), paymentController.handleStripeWebhook);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'uniday-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 }
}));

// make session user available in all views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

app.use(async (req, res, next) => {
  res.locals.pendingPaymentCount = 0;
  res.locals.unreadNotificationCount = 0;
  res.locals.assistantPreviewMessages = [];
  const user = req.session.user;
  if (!user) return next();

  try {
    const tasks = [
      notificationModel.countUnreadForUser(user.user_id),
      notificationModel.getUnreadForUser(user.user_id, 3),
    ];

    if (user.role === 'customer') {
      tasks.push(bookingModel.countActivePendingPaymentBookings(user.customer_id || user.user_id));
    }

    const [unreadCount, assistantPreviewMessages, pendingPaymentCount = 0] = await Promise.all(tasks);
    res.locals.unreadNotificationCount = unreadCount;
    res.locals.assistantPreviewMessages = assistantPreviewMessages;
    res.locals.pendingPaymentCount = pendingPaymentCount;
  } catch (err) {
    console.error('[app] Failed to load navigation counters:', err.message);
  }
  next();
});

app.use('/',           marketplaceRoutes);
app.use('/auth',       authRoutes);
app.use('/merchant',   merchantRoutes);
app.use('/admin',      adminRoutes);
app.use('/book',       bookingRoutes);
// Backward-compatible payment intent endpoint used by checkout JS.
app.post('/create-payment-intent', paymentController.createStripeIntent);
app.use('/payment',    paymentRoutes);
app.use('/whatsapp',   whatsappRoutes);
app.use('/favourite', favouriteRoutes);
app.use('/loyalty',    loyaltyRoutes);
app.use('/notifications', notificationRoutes);
app.use('/assistant', notificationRoutes);

async function releaseExpiredPendingPayments() {
  try {
    const released = await bookingModel.expirePendingPaymentBookings();
    if (released) {
      console.log(`[booking] Released ${released} expired pending payment slot(s).`);
    }
  } catch (err) {
    console.error('[booking] Failed to release expired pending payment slots:', err.message);
  }
}

releaseExpiredPendingPayments();
setInterval(releaseExpiredPendingPayments, 60 * 1000);

app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const MAX_PORT_ATTEMPTS = process.env.PORT ? 1 : 10;

function startServer(port, attemptsLeft = MAX_PORT_ATTEMPTS) {
  const server = app.listen(port, () => {
    console.log(`Uniday running on http://localhost:${port}`);
  });

  server.on('error', (err) => {
    const canRetry = err.code === 'EADDRINUSE' && attemptsLeft > 1;

    if (!canRetry) {
      console.error(err);
      process.exit(1);
    }

    const nextPort = port + 1;
    console.warn(`Port ${port} is already in use. Trying http://localhost:${nextPort}`);
    startServer(nextPort, attemptsLeft - 1);
  });
}

startServer(DEFAULT_PORT);

reminderService.startReminderScheduler();
