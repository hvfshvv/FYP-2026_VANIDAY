const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/authController');

router.get('/login',    ctrl.showLogin);
router.post('/login',   ctrl.login);
router.get('/forgot-password', ctrl.showForgotPassword);
router.post('/forgot-password', ctrl.requestPasswordReset);
router.get('/reset-password/:token', ctrl.showResetPassword);
router.post('/reset-password/:token', ctrl.resetPassword);
router.get('/start',    ctrl.showStartpage);
router.get('/register', ctrl.showRegister);
router.post('/register', ctrl.register);
router.get('/registerMer', ctrl.showMerchantRegister);
router.get('/merchant-pending', ctrl.showMerchantPending);
router.get('/merchant-rejected', ctrl.showMerchantRejected);
router.get('/logout',   ctrl.logout);

module.exports = router;
