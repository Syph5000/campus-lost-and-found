// Require a logged-in user. Remembers the page they wanted so login can
// send them back to it.
function requireLogin(req, res, next) {
    if (!req.session.user) {
        if (req.method === 'GET') {
            req.session.returnTo = req.originalUrl;
        }

        return res.redirect('/login');
    }

    next();
}

// Require one of the given roles, e.g. router.use(requireRole('admin')).
// Use this for any administrator-only page or action.
function requireRole(...roles) {
    return (req, res, next) => {
        const user = req.session.user;

        if (!user) {
            if (req.method === 'GET') {
                req.session.returnTo = req.originalUrl;
            }

            return res.redirect('/login');
        }

        if (!roles.includes(user.role)) {
            return res.fail(403, 'You do not have permission to view this page.');
        }

        next();
    };
}

// The single rule for "may this user manage a record owned by ownerId?"
function isOwnerOrAdmin(user, ownerId) {
    return Boolean(user && (user.id === ownerId || user.role === 'admin'));
}

const isAdmin = (user) => Boolean(user && user.role === 'admin');

module.exports = { requireLogin, requireRole, isOwnerOrAdmin, isAdmin };
