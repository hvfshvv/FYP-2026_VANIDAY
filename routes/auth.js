const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/authController');

router.get('/login',    ctrl.showLogin);
router.post('/login',   ctrl.login);
router.get('/start',    ctrl.showStartpage);
router.get('/register', ctrl.showRegister);
router.post('/register', ctrl.register);
router.get('/registerMer', ctrl.showMerchantRegister);
router.get('/logout',   ctrl.logout);

module.exports = router;
