const itemModel = require('../models/itemModel');
const claimModel = require('../models/claimModel');
const { isOwnerOrAdmin, isAdmin } = require('../middleware/auth');
const { removeFile } = require('../middleware/upload');
const { CATEGORIES, DELETABLE_STATUSES } = require('../config/constants');
const { validateItem, cleanSearch } = require('../utils/validators');

const isValidId = (value) => /^\d+$/.test(String(value));
const isOpen = (item) => item.status === 'lost' || item.status === 'found';

function flash(req, type, message) {
    req.session.flash = { type, message };
}

// One form template serves both "report" and "edit"
function renderItemForm(res, status, error, form = {}, item = null) {
    const editing = Boolean(item);

    return res.status(status).render('report', {
        title: editing ? 'Edit Report' : 'Report an Item',
        heading: editing ? 'Edit Report' : 'Report an Item',
        intro: editing
            ? 'Update the details of your report.'
            : 'Provide the details of the lost or found item.',
        submitLabel: editing ? 'Save Changes' : 'Submit Report',
        action: editing ? `/items/${item.id}/edit` : '/report',
        cancelHref: editing ? `/items/${item.id}` : '/my-reports',
        editing,
        currentImage: editing ? item.image : null,
        lockedType: editing ? item.item_type : null,
        error,
        form,
        categories: CATEGORIES
    });
}

// ----- public pages -----

exports.home = async (req, res) => {
    try {
        const [stats, items] = await Promise.all([
            itemModel.stats(),
            itemModel.listRecent(4)
        ]);

        res.render('index', {
            title: 'Campus Lost and Found',
            items,
            stats: { total: stats.total, lost: stats.lost, found: stats.found }
        });
    } catch (error) {
        console.error('Home page error:', error);
        res.fail(500, 'Unable to load the home page.');
    }
};

exports.browse = async (req, res) => {
    try {
        const search = cleanSearch(req.query.search);
        const status = (req.query.status || '').toString().trim().toLowerCase();
        const items = await itemModel.search({ search, type: status });

        res.render('items', { title: 'Lost and Found Items', items, search, status });
    } catch (error) {
        console.error('Browse items error:', error);
        res.fail(500, 'Unable to load items.');
    }
};

exports.details = async (req, res) => {
    try {
        if (!isValidId(req.params.id)) return res.fail(404, 'Item not found.');

        const item = await itemModel.findWithReporter(req.params.id);
        if (!item) return res.fail(404, 'Item not found.');

        const user = req.session.user;
        const isManager = isOwnerOrAdmin(user, item.user_id);

        const admin = isAdmin(user);

        // Claim tickets are visible to administrators only
        const claims = admin ? await claimModel.listForItem(item.id) : [];
        const myClaim =
            user && user.id !== item.user_id
                ? await claimModel.latestByClaimant(item.id, user.id)
                : null;

        res.render('item-details', {
            title: item.title,
            item,
            isManager,
            isAdmin: admin,
            canDelete: admin && DELETABLE_STATUSES.includes(item.status),
            isOpen: isOpen(item),
            claims,
            myClaim
        });
    } catch (error) {
        console.error('Item details error:', error);
        res.fail(500, 'Unable to load item details.');
    }
};

// ----- report -----

exports.reportForm = (req, res) => renderItemForm(res, 200, null);

exports.reportSubmit = async (req, res) => {
    const form = req.body || {};

    if (req.uploadError) return renderItemForm(res, 400, req.uploadError, form);

    const savedImage = req.file ? `uploads/${req.file.filename}` : null;

    try {
        const { errors, values } = validateItem(form, { needType: true });

        if (errors.length > 0) {
            removeFile(savedImage);
            return renderItemForm(res, 400, errors, form);
        }

        await itemModel.create({
            userId: req.session.user.id,
            title: values.title,
            description: values.description,
            category: values.category,
            location: values.location,
            date: values.date,
            type: form.item_type,
            image: savedImage
        });

        flash(req, 'success', 'Your report was submitted. Thank you for helping!');
        res.redirect('/my-reports');
    } catch (error) {
        console.error('Report item error:', error);
        removeFile(savedImage);
        renderItemForm(res, 500, 'Unable to submit your report. Please try again.', form);
    }
};

exports.myReports = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const [items, claims] = await Promise.all([
            itemModel.listByUser(userId),
            claimModel.listByClaimant(userId)
        ]);

        res.render('my-reports', { title: 'My Reports', items, claims });
    } catch (error) {
        console.error('My reports error:', error);
        res.fail(500, 'Unable to load your reports.');
    }
};

// ----- owner / admin actions -----

// Loads the item and enforces owner-or-admin. Sends the error response itself
// and returns null when the caller must stop.
async function loadManagedItem(req, res) {
    if (!isValidId(req.params.id)) {
        res.fail(404, 'Item not found.');
        return null;
    }

    const item = await itemModel.findById(req.params.id);

    if (!item) {
        res.fail(404, 'Item not found.');
        return null;
    }

    if (!isOwnerOrAdmin(req.session.user, item.user_id)) {
        res.fail(403, 'You do not have permission to change this report.');
        return null;
    }

    return item;
}

exports.editForm = async (req, res) => {
    try {
        const item = await loadManagedItem(req, res);
        if (!item) return;

        if (!isOpen(item)) {
            flash(req, 'error', 'Only open reports can be edited.');
            return res.redirect(`/items/${item.id}`);
        }

        renderItemForm(res, 200, null, item, item);
    } catch (error) {
        console.error('Edit form error:', error);
        res.fail(500, 'Unable to load the edit form.');
    }
};

exports.editSubmit = async (req, res) => {
    const newImage = req.file ? `uploads/${req.file.filename}` : null;

    try {
        const item = await loadManagedItem(req, res);

        if (!item) {
            removeFile(newImage);
            return;
        }

        if (!isOpen(item)) {
            removeFile(newImage);
            flash(req, 'error', 'Only open reports can be edited.');
            return res.redirect(`/items/${item.id}`);
        }

        const form = req.body || {};

        if (req.uploadError) return renderItemForm(res, 400, req.uploadError, form, item);

        const { errors, values } = validateItem(form, { needType: false });

        if (errors.length > 0) {
            removeFile(newImage);
            return renderItemForm(res, 400, errors, form, item);
        }

        // New upload replaces the photo; the checkbox removes it; else keep it
        let image = item.image;
        if (newImage) image = newImage;
        else if (form.remove_image === '1') image = null;

        await itemModel.update(item.id, {
            title: values.title,
            description: values.description,
            category: values.category,
            location: values.location,
            date: values.date,
            image
        });

        if (image !== item.image) removeFile(item.image);

        flash(req, 'success', 'Your report was updated.');
        res.redirect(`/items/${item.id}`);
    } catch (error) {
        console.error('Edit item error:', error);
        removeFile(newImage);
        res.fail(500, 'Unable to update this report.');
    }
};

exports.markReturned = async (req, res) => {
    try {
        const item = await loadManagedItem(req, res);
        if (!item) return;

        const admin = isAdmin(req.session.user);

        // Owners can close their own open reports; only an admin completes
        // the handover of an item whose claim was already approved.
        if (item.status === 'returned' || (item.status === 'claimed' && !admin)) {
            flash(req, 'error', 'This item can no longer be marked as returned.');
            return res.redirect(`/items/${item.id}`);
        }

        await itemModel.markReturned(item.id);

        flash(req, 'success', 'The item was marked as returned.');
        res.redirect(`/items/${item.id}`);
    } catch (error) {
        console.error('Mark returned error:', error);
        res.fail(500, 'Unable to update this report.');
    }
};

// Admin only (the route enforces it). Students can never delete a report.
exports.remove = async (req, res) => {
    try {
        if (!isValidId(req.params.id)) return res.fail(404, 'Item not found.');

        const item = await itemModel.findById(req.params.id);
        if (!item) return res.fail(404, 'Item not found.');

        if (!DELETABLE_STATUSES.includes(item.status)) {
            flash(req, 'error', 'A report can only be deleted after it has been confirmed (claimed or returned).');
            return res.redirect(`/items/${item.id}`);
        }

        await itemModel.remove(item.id);
        removeFile(item.image);

        flash(req, 'success', 'The report was deleted.');
        res.redirect('/admin/items');
    } catch (error) {
        console.error('Delete item error:', error);
        res.fail(500, 'Unable to delete this report.');
    }
};
