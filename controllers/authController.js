const bcrypt    = require('bcryptjs');
const authModel = require('../models/authModel');

const ALLOWED_ROLES = ['customer', 'merchant'];

function redirectDashboard(res, user) {
  return res.redirect(user.role === 'merchant' ? '/merchant/dashboard' : '/');
}

function showLogin(req, res) {
  if (req.session.user) return redirectDashboard(res, req.session.user);
  res.render('auth/login', { title: 'Login', error: null, query: req.query });
}

function showRegister(req, res) {
  if (req.session.user) return redirectDashboard(res, req.session.user);
  res.render('auth/register', { title: 'Register', error: null });
}

async function login(req, res) {
  const { email, password } = req.body;
  try {
    const user = await authModel.findUserByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.render('auth/login', { title: 'Login', error: 'Invalid email or password.' });
    }
    req.session.user = {
      user_id:   user.user_id,
      full_name: user.full_name,
      email:     user.email,
      phone:     user.phone || '',
      role:      user.role,
    };
    if (user.role === 'merchant') {
      const merchant = await authModel.getMerchantByUserId(user.user_id);
      req.session.user.merchant_id = merchant ? merchant.merchant_id : null;
      return res.redirect('/merchant/dashboard');
    }
    const next = req.query.next;
    res.redirect(next && next.startsWith('/') ? next : '/');
  } catch (err) {
    console.error(err);
    res.render('auth/login', { title: 'Login', error: 'Something went wrong. Please try again.' });
  }
}

async function register(req, res) {
  const { full_name, email, password, phone, role, merchant_name, address } = req.body;
  const safeRole = ALLOWED_ROLES.includes(role) ? role : 'customer';
  try {
    const existing = await authModel.findUserByEmail(email);
    if (existing) {
      return res.render('auth/register', { title: 'Register', error: 'That email is already registered. Please log in instead.' });
    }
    if (!password || password.length < 6) {
      return res.render('auth/register', { title: 'Register', error: 'Password must be at least 6 characters.' });
    }
    const hash   = await bcrypt.hash(password, 10);
    const userId = await authModel.createUser(full_name, email, hash, phone, safeRole);

    if (safeRole === 'merchant') {
      if (!merchant_name || !merchant_name.trim()) {
        return res.render('auth/register', { title: 'Register', error: 'Please enter your business name.' });
      }
      await authModel.createMerchantProfile(userId, merchant_name.trim(), email, phone, address || '');
    }
    res.redirect('/auth/login?registered=1');
  } catch (err) {
    console.error(err);
    res.render('auth/register', { title: 'Register', error: 'Registration failed. Please try again.' });
  }
}

function logout(req, res) {
  req.session.destroy(() => res.redirect('/'));
}

module.exports = { showLogin, showRegister, login, register, logout };
