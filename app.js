require('dotenv').config();
const express    = require('express');
const session    = require('express-session');
const path       = require('path');

const authRoutes        = require('./routes/auth');
const merchantRoutes    = require('./routes/merchant');
const adminRoutes       = require('./routes/admin');
const bookingRoutes     = require('./routes/booking');
const paymentRoutes     = require('./routes/payment');
const marketplaceRoutes = require('./routes/marketplace');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

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

app.use('/',           marketplaceRoutes);
app.use('/auth',       authRoutes);
app.use('/merchant',   merchantRoutes);
app.use('/admin',      adminRoutes);
app.use('/book',       bookingRoutes);
app.use('/payment',    paymentRoutes);

app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Uniday running on http://localhost:${PORT}`));
