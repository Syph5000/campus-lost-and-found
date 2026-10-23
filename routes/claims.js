const express = require('express');
const router = express.Router();
const claims = require('../controllers/claimController');
const { requireLogin, requireRole } = require('../middleware/auth');

router.get('/claims/new/:id', requireLogin, claims.newForm);
router.post('/claims/new/:id', requireLogin, claims.submit);

module.exports = router;
