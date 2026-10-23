const crypto = require('crypto');
const fs = require('fs');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// One random token per session, created the first time a page asks for it.
function getToken(req) {
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }

    return req.session.csrfToken;
}

// Makes <%= csrfToken %> available in every view. It is a lazy getter, so
// pages without forms do not create a session just to hold a token.
function exposeToken(req, res, next) {
    Object.defineProperty(res.locals, 'csrfToken', {
        enumerable: true,
        configurable: true,
        get: () => getToken(req)
    });

    next();
}

// Rejects state-changing requests that do not carry the session's token.
// The token can be sent as a "_csrf" form field or an "x-csrf-token" header.
function verifyCsrf(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();

    const sent = (req.body && req.body._csrf) || req.get('x-csrf-token');
    const expected = req.session && req.session.csrfToken;

    const valid =
        typeof sent === 'string' &&
        typeof expected === 'string' &&
        sent.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));

    if (valid) return next();

    // A rejected upload must not leave its file on disk
    if (req.file) fs.unlink(req.file.path, () => {});

    res.fail(403, 'Your form expired or was invalid. Please go back, refresh the page and try again.');
}

// Multipart bodies are not parsed yet when the global check runs, so the
// global check skips them. Any multipart route MUST run verifyCsrf itself,
// after its multer middleware (see routes/items.js, POST /report).
function verifyUnlessMultipart(req, res, next) {
    if (req.is('multipart/form-data')) return next();

    verifyCsrf(req, res, next);
}

module.exports = { exposeToken, verifyCsrf, verifyUnlessMultipart };
