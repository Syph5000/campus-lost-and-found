require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const { exposeToken, verifyUnlessMultipart } = require('./middleware/csrf');

// Connects to MySQL and prints the connection status
const db = require('./config/db');

// The session secret signs every login cookie, so there is no fallback:
// refuse to start without a real one.
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
    console.error(
        'SESSION_SECRET is missing or shorter than 32 characters. ' +
        'Set it in .env (see .env.example) and restart.'
    );
    process.exit(1);
}

const isProduction = process.env.NODE_ENV === 'production';

const authRoutes = require('./routes/auth');
const itemRoutes = require('./routes/items');
const claimRoutes = require('./routes/claims');
const adminRoutes = require('./routes/admin');
const userModel = require('./models/userModel');

const app = express();
const PORT = process.env.PORT || 3000;

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files (css, images, uploaded item photos)
app.use(express.static(path.join(__dirname, 'public')));

// Body parsers
// Small body limits: forms here are short text (photos go through multer)
app.use(express.urlencoded({ extended: true, limit: '20kb' }));
app.use(express.json({ limit: '20kb' }));

// Behind a reverse proxy (Nginx, Render, Railway...) secure cookies need this
if (isProduction) {
    app.set('trust proxy', 1);
}

// Sessions. The default in-memory store is fine for local development only
// (it leaks memory and forgets everyone on restart), so production keeps
// sessions in MySQL instead. The table is created automatically.
let sessionStore;

if (isProduction) {
    const MySQLStore = require('express-mysql-session')(session);
    sessionStore = new MySQLStore({}, db);
}

app.use(session({
    name: 'connect.sid',
    secret: SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    // rolling: the 60 minute timer restarts on every request, so the session
    // ends after an hour of INACTIVITY rather than an hour after login
    rolling: true,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
        maxAge: 1000 * 60 * 60
    }
}));

// Browsers ask for a favicon on every page; answer it here so it cannot
// use up the one-time flash message meant for the page itself.
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Values available in every EJS view
app.use((req, res, next) => {
    res.locals.currentUser = req.session.user || null;

    // One-time message set before a redirect (see req.session.flash)
    res.locals.flash = req.session.flash || null;
    delete req.session.flash;

    // "2026-10-14" or "2026-10-14 09:30:00" -> "Oct 14, 2026"
    res.locals.formatDate = (value) => {
        if (!value) return '';

        const date = new Date(String(value).replace(' ', 'T'));

        if (Number.isNaN(date.getTime())) return String(value);

        return date.toLocaleDateString('en-PH', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    // Label and colour class for an item's badge
    res.locals.itemBadge = (item) => {
        if (item.status === 'claimed') {
            return { cls: 'claimed', label: 'Claimed' };
        }

        if (item.status === 'returned') {
            return { cls: 'returned', label: 'Returned' };
        }

        return item.item_type === 'found'
            ? { cls: 'found', label: 'Found' }
            : { cls: 'lost', label: 'Lost' };
    };

    // Render the friendly error page: res.fail(404, 'Item not found.')
    res.fail = (status, message) => {
        res.status(status).render('error', {
            title: status === 404 ? 'Page not found' : 'Something went wrong',
            status,
            message
        });
    };

    next();
});

// The session caches the user's role at login. Re-read it on every request so
// a demoted admin (or a deleted account) loses access immediately instead of
// when the session expires.
app.use(async (req, res, next) => {
    const sessionUser = req.session.user;
    if (!sessionUser) return next();

    try {
        const fresh = await userModel.findById(sessionUser.id);

        if (!fresh) {
            return req.session.destroy(() => {
                res.clearCookie('connect.sid');
                res.redirect('/login');
            });
        }

        if (fresh.role !== sessionUser.role) {
            sessionUser.role = fresh.role;
        }

        // The view reads currentUser from res.locals, which was set earlier
        res.locals.currentUser = req.session.user;
        next();
    } catch (error) {
        next(error);
    }
});

// Signed-in pages must not be kept in the browser cache, otherwise pressing
// Back after logging out could still show them.
app.use((req, res, next) => {
    if (req.session.user) res.set('Cache-Control', 'no-store');
    next();
});

// CSRF protection for every POST/PUT/PATCH/DELETE (multipart forms are
// verified inside their own route, after the upload is parsed)
app.use(exposeToken);
app.use(verifyUnlessMultipart);

// Routes
app.use('/', authRoutes);
app.use('/', itemRoutes);
app.use('/', claimRoutes);
app.use('/admin', adminRoutes);

// 404 for anything else
app.use((req, res) => {
    res.fail(404, 'The page you are looking for does not exist.');
});

// Errors. res.fail only exists once the middleware above it has run, so an
// error thrown earlier (for example by the body parser) falls back to plain text.
app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    // The visitor sent something we refuse (too large, malformed): not our bug
    const status = err.status >= 400 && err.status < 500 ? err.status : 500;
    const message =
        status === 413 ? 'The information you sent was too large.'
        : status < 500 ? 'The request could not be understood.'
        : 'Something went wrong on our side. Please try again.';

    if (status === 500) {
        console.error('Unhandled error:', err);
    }

    if (typeof res.fail === 'function') {
        return res.fail(status, message);
    }

    res.status(status).type('text/plain').send(message);
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
