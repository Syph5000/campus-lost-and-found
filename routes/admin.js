const express = require('express');
const router = express.Router();
const admin = require('../controllers/adminController');
const { requireRole } = require('../middleware/auth');

// Every route in this file is administrator-only
router.use(requireRole('admin'));

router.get('/', admin.dashboard);
router.get('/items', admin.items);
router.get('/users', admin.users);
router.post('/users/:id/role', admin.changeRole);

module.exports = router;
