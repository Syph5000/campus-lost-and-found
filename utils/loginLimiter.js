// Slows down password guessing: after MAX_FAILURES wrong passwords for the
// same email from the same address, further attempts are refused until the
// lock expires. Kept in memory, which is enough for one server; use a shared
// store (e.g. Redis) if the app ever runs on several servers.
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

const attempts = new Map();

const keyFor = (ip, email) => `${ip}|${email}`;

function lockedForMs(ip, email) {
    const entry = attempts.get(keyFor(ip, email));

    if (!entry) return 0;

    if (entry.lockedUntil && entry.lockedUntil > Date.now()) {
        return entry.lockedUntil - Date.now();
    }

    if (entry.lockedUntil) attempts.delete(keyFor(ip, email));
    return 0;
}

function recordFailure(ip, email) {
    const key = keyFor(ip, email);
    const entry = attempts.get(key) || { count: 0, lockedUntil: 0 };

    entry.count += 1;

    if (entry.count >= MAX_FAILURES) {
        entry.lockedUntil = Date.now() + LOCK_MS;
        entry.count = 0;
    }

    attempts.set(key, entry);
}

function reset(ip, email) {
    attempts.delete(keyFor(ip, email));
}

// Forget old entries so the map cannot grow forever
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of attempts) {
        if (!entry.lockedUntil || entry.lockedUntil < now) {
            if (!entry.lockedUntil && entry.count === 0) attempts.delete(key);
        }
    }
}, 30 * 60 * 1000).unref();

module.exports = { lockedForMs, recordFailure, reset, MAX_FAILURES, LOCK_MS };
