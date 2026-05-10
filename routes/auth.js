const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/authController');

router.get('/login',    ctrl.showLogin);
router.post('/login',   ctrl.login);
router.get('/register', ctrl.showRegister);
router.post('/register', ctrl.register);
router.get('/logout',   ctrl.logout);

module.exports = router;
