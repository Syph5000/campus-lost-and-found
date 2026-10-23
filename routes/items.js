const express = require('express');
const router = express.Router();
const items = require('../controllers/itemController');
const { requireLogin } = require('../middleware/auth');
const { uploadImage } = require('../middleware/upload');
const { verifyCsrf } = require('../middleware/csrf');

// Logged-out visitors land on the portal (choose Administrator / Student).
// Logged-in users see the main page. /items stays public for guests.
router.get('/', (req, res, next) => {
    if (!req.session.user) return res.redirect('/portal');
    next();
}, items.home);
router.get('/items', items.browse);

router.get('/report', requireLogin, items.reportForm);
// verifyCsrf runs after uploadImage because multipart fields are only readable then
router.post('/report', requireLogin, uploadImage('image'), verifyCsrf, items.reportSubmit);

router.get('/my-reports', requireLogin, items.myReports);
router.get('/items/:id', items.details);

router.get('/items/:id/edit', requireLogin, items.editForm);
router.post('/items/:id/edit', requireLogin, uploadImage('image'), verifyCsrf, items.editSubmit);

router.post('/items/:id/returned', requireLogin, items.markReturned);
router.post('/items/:id/delete', requireLogin, items.remove);

module.exports = router;
