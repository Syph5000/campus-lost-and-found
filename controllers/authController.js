const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const { validateRegistration, validateLogin } = require('../utils/validators');
const limiter = require('../utils/loginLimiter');

function renderRegister(res, status, error, old = {}) {
    return res.status(status).render('register', { title: 'Register', error, old });
}

// Which "door" the visitor chose on the portal page: 'admin', 'student' or ''
const portalOf = (value) => (value === 'admin' || value === 'student' ? value : '');

exports.showPortal = (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.render('portal', { title: 'Welcome' });
};

exports.showLogin = (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.render('login', { title: 'Login', error: null, portal: portalOf(req.query.as) });
};

exports.showRegister = (req, res) => {
    if (req.session.user) return res.redirect('/');
    renderRegister(res, 200, null);
};

exports.register = async (req, res) => {
    const body = req.body || {};
    // Re-fill the form with what was typed (never the passwords)
    const old = {
        full_name: String(body.full_name || '').slice(0, 100),
        student_id: String(body.student_id || '').slice(0, 30),
        email: String(body.email || '').slice(0, 100)
    };

    try {
        const { errors, values } = validateRegistration(body);

        // Duplicate checks only make sense once the fields themselves are valid
        if (errors.length === 0) {
            if (await userModel.emailTaken(values.email)) {
                errors.push('That email address is already registered. Try signing in instead.');
            }

            if (await userModel.studentIdTaken(values.studentId)) {
                errors.push('That student ID is already registered.');
            }
        }

        if (errors.length > 0) {
            return renderRegister(res, errors.some((e) => /already registered/.test(e)) ? 409 : 400, errors, old);
        }

        await userModel.create({
            fullName: values.fullName,
            studentId: values.studentId,
            email: values.email,
            passwordHash: await bcrypt.hash(values.password, 10)
        });

        req.session.flash = { type: 'success', message: 'Account created! You can now sign in.' };
        res.redirect('/login?as=student');
    } catch (error) {
        console.error('Registration error:', error);

        // Two people registering at the same moment can slip past the checks
        // above; the database's unique keys still catch it.
        if (error.code === 'ER_DUP_ENTRY') {
            return renderRegister(res, 409, 'That email or student ID is already registered.', old);
        }

        renderRegister(res, 500, 'Unable to register. Please try again.', old);
    }
};

exports.login = async (req, res) => {
    const portal = portalOf((req.body || {}).portal);
    const fail = (status, error) =>
        res.status(status).render('login', { title: 'Login', error, portal });

    try {
        const { errors, values } = validateLogin(req.body);

        if (errors.length > 0) return fail(400, errors);

        const waitMs = limiter.lockedForMs(req.ip, values.email);

        if (waitMs > 0) {
            const minutes = Math.ceil(waitMs / 60000);
            return fail(
                429,
                `Too many failed sign-in attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
            );
        }

        const user = await userModel.findByEmail(values.email);

        if (!user || !(await bcrypt.compare(values.password, user.password))) {
            limiter.recordFailure(req.ip, values.email);
            return fail(401, 'Invalid email or password.');
        }

        limiter.reset(req.ip, values.email);

        // The administrator door only admits administrator accounts. This is
        // checked after the password, so it never reveals which emails exist.
        if (portal === 'admin' && user.role !== 'admin') {
            return fail(
                403,
                'This account is not an administrator account. Use the Student login instead.'
            );
        }

        const returnTo = req.session.returnTo;

        // Prevent session fixation by creating a fresh session
        req.session.regenerate((err) => {
            if (err) {
                console.error('Session error:', err);
                return res.fail(500, 'Unable to start your session. Please try again.');
            }

            req.session.user = {
                id: user.id,
                full_name: user.full_name,
                student_id: user.student_id,
                email: user.email,
                role: user.role
            };

            req.session.save((saveErr) => {
                if (saveErr) {
                    console.error('Session save error:', saveErr);
                    return res.fail(500, 'Unable to save your session. Please try again.');
                }

                // Only follow same-site paths
                const safeReturn =
                    typeof returnTo === 'string' &&
                    returnTo.startsWith('/') &&
                    !returnTo.startsWith('//')
                        ? returnTo
                        : portal === 'admin' ? '/admin' : '/';

                res.redirect(safeReturn);
            });
        });
    } catch (error) {
        console.error('Login error:', error);
        fail(500, 'Something went wrong. Please try again.');
    }
};

exports.logout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.fail(500, 'Unable to log out.');
        }

        res.clearCookie('connect.sid');
        res.redirect('/portal');
    });
};
