const userModel = require('../models/userModel');
const itemModel = require('../models/itemModel');
const { cleanSearch } = require('../utils/validators');

const isValidId = (value) => /^\d+$/.test(String(value));

exports.dashboard = async (req, res) => {
    try {
        const [userCount, itemStats, recentItems] =
            await Promise.all([
                userModel.count(),
                itemModel.stats(),
                itemModel.listRecent(5)
            ]);

        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            adminTab: 'dashboard',
            userCount, itemStats, recentItems
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.fail(500, 'Unable to load the admin dashboard.');
    }
};

exports.items = async (req, res) => {
    try {
        const search = cleanSearch(req.query.search);
        const status = (req.query.status || '').toString().trim().toLowerCase();
        const items = await itemModel.listForAdmin({ search, status });

        res.render('admin/items', {
            title: 'Manage Reports',
            adminTab: 'items',
            items, search, status
        });
    } catch (error) {
        console.error('Admin items error:', error);
        res.fail(500, 'Unable to load reports.');
    }
};

exports.users = async (req, res) => {
    try {
        const users = await userModel.listWithActivity();

        res.render('admin/users', {
            title: 'Manage Users',
            adminTab: 'users',
            users
        });
    } catch (error) {
        console.error('Admin users error:', error);
        res.fail(500, 'Unable to load users.');
    }
};

exports.changeRole = async (req, res) => {
    try {
        if (!isValidId(req.params.id)) return res.fail(404, 'User not found.');

        const role = (req.body || {}).role;

        if (!['student', 'admin'].includes(role)) {
            return res.fail(400, 'Invalid role.');
        }

        // Stops an admin locking themselves out (and the last admin vanishing)
        if (Number(req.params.id) === req.session.user.id) {
            req.session.flash = { type: 'error', message: 'You cannot change your own role.' };
            return res.redirect('/admin/users');
        }

        const target = await userModel.findById(req.params.id);
        if (!target) return res.fail(404, 'User not found.');

        await userModel.setRole(target.id, role);

        req.session.flash = {
            type: 'success',
            message: `${target.full_name} is now ${role === 'admin' ? 'an administrator' : 'a student'}.`
        };
        res.redirect('/admin/users');
    } catch (error) {
        console.error('Change role error:', error);
        res.fail(500, 'Unable to change this role.');
    }
};
