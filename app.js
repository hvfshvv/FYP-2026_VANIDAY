// Keep application-side date calculations aligned with the business location.
process.env.TZ = process.env.APP_TIMEZONE || 'Asia/Singapore';

const express    = require('express');
const session    = require('express-session');
const path       = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

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
const walletRoutes      = require('./routes/walletRoutes');
const notificationRoutes = require('./routes/notifications');
const clientDiariesRoutes = require('./routes/clientDiaries');
const legalRoutes = require('./routes/legal');
const accountRoutes = require('./routes/account');
const supportRoutes = require('./routes/support');
const reminderService   = require('./services/reminderService');
const payoutService = require('./services/payoutService');
const bookingNotificationModel = require('./models/bookingNotificationModel');
const notificationModel = require('./models/notificationModel');
const waitlistModel = require('./models/waitlistModel');
const i18nMiddleware = require('./middleware/i18n');

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

app.use(i18nMiddleware);

// make session user available in all views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

app.use(async (req, res, next) => {
  res.locals.pendingPaymentCount = 0;
  res.locals.unreadNotificationCount = 0;
  const user = req.session.user;
  if (!user) return next();

  try {
    await waitlistModel.expireOffersAndPromote();
    const unreadCount = await notificationModel.countUnreadForUser(user.user_id);

    if (user.role === 'customer') {
      const pendingPaymentCount = await bookingNotificationModel.countActivePendingPaymentBookings(user.customer_id || user.user_id);
      res.locals.pendingPaymentCount = pendingPaymentCount;
    }

    res.locals.unreadNotificationCount = unreadCount;
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
app.use('/wallet',     walletRoutes);
app.use('/notifications', notificationRoutes);
app.use('/client-diaries', clientDiariesRoutes);
app.use('/legal', legalRoutes);
app.use('/account', accountRoutes);
app.use('/support', supportRoutes);

app.get('/internal/payouts/run', async (req, res) => {
  const expectedSecret = process.env.CRON_SECRET;
  const authHeader = req.get('authorization') || '';
  const providedSecret = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : req.query.secret;

  if (expectedSecret && providedSecret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await payoutService.createDueWeeklyPayouts();
    res.json({ ok: true, result });
  } catch (err) {
    console.error('[cron] payout run failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

async function releaseExpiredPendingPayments() {
  try {
    const released = await bookingNotificationModel.expirePendingPaymentBookings();
    if (released) {
      console.log(`[booking] Released ${released} expired pending payment slot(s).`);
    }
  } catch (err) {
    console.error('[booking] Failed to release expired pending payment slots:', err.message);
  }
}

function startBackgroundJobs() {
  releaseExpiredPendingPayments();
  setInterval(releaseExpiredPendingPayments, 60 * 1000);

  async function releaseExpiredWaitlistOffers() {
    try {
      const expired = await waitlistModel.expireOffersAndPromote();
      if (expired) {
        console.log(`[waitlist] Expired ${expired} waitlist offer(s).`);
      }
    } catch (err) {
      console.error('[waitlist] Failed to expire waitlist offers:', err.message);
    }
  }

  releaseExpiredWaitlistOffers();
  setInterval(releaseExpiredWaitlistOffers, 60 * 1000);

  reminderService.startReminderScheduler();
  payoutService.startPayoutScheduler();
}

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

if (require.main === module) {
  startServer(DEFAULT_PORT);
  startBackgroundJobs();
}

module.exports = app;
