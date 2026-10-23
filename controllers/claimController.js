const itemModel = require('../models/itemModel');
const claimModel = require('../models/claimModel');
const { isAdmin } = require('../middleware/auth');
const { validateClaimMessage } = require('../utils/validators');

const isValidId = (value) => /^\d+$/.test(String(value));
const isOpen = (item) => item.status === 'lost' || item.status === 'found';

exports.newForm = async (req, res) => {
    try {
        if (!isValidId(req.params.id)) return res.fail(404, 'Item not found.');

        const item = await itemModel.findById(req.params.id);
        if (!item) return res.fail(404, 'Item not found.');

        if (item.user_id === req.session.user.id) {
            req.session.flash = {
                type: 'error',
                message: 'You cannot claim an item you reported yourself.'
            };
            return res.redirect(`/items/${item.id}`);
        }

        if (!isOpen(item)) {
            req.session.flash = {
                type: 'error',
                message: 'This item is no longer open for claims.'
            };
            return res.redirect(`/items/${item.id}`);
        }

        res.render('claim', { title: 'Submit a Claim', item, error: null, message: '' });
    } catch (error) {
        console.error('Claim form error:', error);
        res.fail(500, 'Unable to load the claim form.');
    }
};

exports.submit = async (req, res) => {
    try {
        if (!isValidId(req.params.id)) return res.fail(404, 'Item not found.');

        const item = await itemModel.findById(req.params.id);
        if (!item) return res.fail(404, 'Item not found.');

        const user = req.session.user;
        const rawMessage = (req.body || {}).message;
        const { errors, values } = validateClaimMessage(rawMessage);
        const message = values.message;

        if (item.user_id === user.id) {
            return res.fail(400, 'You cannot claim an item you reported yourself.');
        }

        if (!isOpen(item)) {
            return res.fail(400, 'This item is no longer open for claims.');
        }

        if (errors.length > 0) {
            return res.status(400).render('claim', {
                title: 'Submit a Claim',
                item,
                error: errors,
                message: typeof rawMessage === 'string' ? rawMessage.slice(0, 1000) : ''
            });
        }

        if (await claimModel.hasPending(item.id, user.id)) {
            req.session.flash = {
                type: 'error',
                message: 'You already have a pending claim for this item.'
            };
            return res.redirect(`/items/${item.id}`);
        }

        await claimModel.create({ itemId: item.id, claimantId: user.id, message });

        req.session.flash = {
            type: 'success',
            message: 'Your claim ticket was submitted.'
        };
        res.redirect('/my-reports');
    } catch (error) {
        console.error('Submit claim error:', error);
        res.fail(500, 'Unable to submit your claim.');
    }
};

function reviewHandler(decision) {
    return async (req, res) => {
        if (!isValidId(req.params.id)) return res.fail(404, 'Claim not found.');

        try {
            const user = req.session.user;
            // Claims are verified by administrators only, not by the reporter
            const result = await claimModel.review(
                req.params.id,
                decision,
                () => isAdmin(user)
            );

            if (result.outcome === 'not_found') return res.fail(404, 'Claim not found.');

            if (result.outcome === 'forbidden') {
                return res.fail(403, 'Only an administrator can review claims.');
            }

            if (result.outcome === 'closed') {
                req.session.flash = {
                    type: 'error',
                    message: 'This claim can no longer be changed.'
                };
                return res.redirect(`/items/${result.itemId}`);
            }

            req.session.flash = {
                type: 'success',
                message:
                    decision === 'approve'
                        ? 'Claim approved. The claimant can now see how to contact the reporter.'
                        : 'Claim rejected.'
            };
            res.redirect(`/items/${result.itemId}`);
        } catch (error) {
            console.error('Review claim error:', error);
            res.fail(500, 'Unable to update this claim.');
        }
    };
}

exports.approve = reviewHandler('approve');
exports.reject = reviewHandler('reject');
