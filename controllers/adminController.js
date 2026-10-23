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
