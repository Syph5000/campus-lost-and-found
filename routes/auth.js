const express = require('express');
const router = express.Router();
const auth = require('../controllers/authController');

router.get('/portal', auth.showPortal);
router.get('/login', auth.showLogin);
router.get('/register', auth.showRegister);
router.post('/register', auth.register);
router.post('/login', auth.login);
// POST so another site cannot log people out with a plain link or image
router.post('/logout', auth.logout);

module.exports = router;
