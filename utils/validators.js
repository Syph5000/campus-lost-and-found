// Central input validation. Every function returns an array of specific,
// human-readable problems (empty array = valid) so forms can show all of
// them at once. Values are trimmed first; nothing here touches the database.
const { CATEGORIES } = require('../config/constants');

const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\s.'-]*$/u;
const STUDENT_ID_PATTERN = /^[A-Za-z0-9-]+$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const LIMITS = {
    name: { min: 2, max: 100 },
    studentId: { min: 3, max: 30 },
    email: { max: 100 },
    // bcrypt only uses the first 72 bytes, so longer passwords are rejected
    password: { min: 8, max: 72 },
    title: { min: 3, max: 150 },
    description: { min: 10, max: 2000 },
    location: { min: 3, max: 255 },
    claim: { min: 10, max: 1000 },
    search: { max: 100 },
    // Reports older than this are almost certainly a typo in the year
    maxReportAgeDays: 730
};

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

function lengthProblem(label, value, { min = 0, max }) {
    if (value.length < min) return `${label} must be at least ${min} characters.`;
    if (value.length > max) return `${label} must be ${max} characters or fewer.`;
    return null;
}

// "2026-02-31" must be rejected, so rebuild the date and compare each part
function parseRealDate(value) {
    const match = DATE_PATTERN.exec(value);
    if (!match) return null;

    const [, y, m, d] = match.map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));

    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
        return null;
    }

    return date;
}

function validateRegistration(body = {}) {
    const fullName = clean(body.full_name);
    const studentId = clean(body.student_id);
    const email = clean(body.email).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const confirm = typeof body.confirm_password === 'string' ? body.confirm_password : '';
    const errors = [];

    if (!fullName) errors.push('Full name is required.');
    else if (lengthProblem('Full name', fullName, LIMITS.name)) {
        errors.push(lengthProblem('Full name', fullName, LIMITS.name));
    } else if (!NAME_PATTERN.test(fullName)) {
        errors.push('Full name may only contain letters, spaces, apostrophes, periods and hyphens.');
    }

    if (!studentId) errors.push('Student ID is required.');
    else if (lengthProblem('Student ID', studentId, LIMITS.studentId)) {
        errors.push(lengthProblem('Student ID', studentId, LIMITS.studentId));
    } else if (!STUDENT_ID_PATTERN.test(studentId)) {
        errors.push('Student ID may only contain letters, numbers and hyphens (for example 2021-00123).');
    }

    if (!email) errors.push('Email address is required.');
    else if (email.length > LIMITS.email.max) {
        errors.push(`Email address must be ${LIMITS.email.max} characters or fewer.`);
    } else if (!EMAIL_PATTERN.test(email)) {
        errors.push('Please enter a valid email address, like name@example.com.');
    }

    if (!password) errors.push('Password is required.');
    else if (lengthProblem('Password', password, LIMITS.password)) {
        errors.push(lengthProblem('Password', password, LIMITS.password));
    } else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        errors.push('Password must contain at least one letter and one number.');
    }

    if (password && password !== confirm) errors.push('Passwords do not match.');

    return { errors, values: { fullName, studentId, email, password } };
}

function validateLogin(body = {}) {
    const email = clean(body.email).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const errors = [];

    if (!email) errors.push('Please enter your email address.');
    else if (email.length > LIMITS.email.max || !EMAIL_PATTERN.test(email)) {
        errors.push('Please enter a valid email address.');
    }

    if (!password) errors.push('Please enter your password.');
    else if (password.length > LIMITS.password.max) errors.push('Invalid email or password.');

    return { errors, values: { email, password } };
}

// needType: new reports must choose lost/found; edits cannot change it
function validateItem(body = {}, { needType }) {
    const title = clean(body.title);
    const description = clean(body.description);
    const location = clean(body.location);
    const category = typeof body.category === 'string' ? body.category : '';
    const dateText = clean(body.date_lost_found);
    const errors = [];

    if (needType && !['lost', 'found'].includes(body.item_type)) {
        errors.push('Please choose whether you lost or found the item.');
    }

    if (!title) errors.push('Item name is required.');
    else if (lengthProblem('Item name', title, LIMITS.title)) {
        errors.push(lengthProblem('Item name', title, LIMITS.title));
    }

    if (!description) errors.push('Description is required.');
    else if (lengthProblem('Description', description, LIMITS.description)) {
        errors.push(lengthProblem('Description', description, LIMITS.description));
    }

    if (!category) errors.push('Please choose a category.');
    else if (!CATEGORIES.includes(category)) errors.push('That category is not valid. Please choose one from the list.');

    if (!location) errors.push('Location is required.');
    else if (lengthProblem('Location', location, LIMITS.location)) {
        errors.push(lengthProblem('Location', location, LIMITS.location));
    }

    if (!dateText) errors.push('Date lost or found is required.');
    else {
        const date = parseRealDate(dateText);
        const now = new Date();
        const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        // One day of slack so a user ahead of the server's timezone is not rejected
        const latest = today + 24 * 60 * 60 * 1000;
        const earliest = today - LIMITS.maxReportAgeDays * 24 * 60 * 60 * 1000;

        if (!date) errors.push('Date must be a real calendar date.');
        else if (date.getTime() > latest) errors.push('Date cannot be in the future.');
        else if (date.getTime() < earliest) errors.push('Date is too far in the past. Please check the year.');
    }

    return {
        errors,
        values: { title, description, category, location, date: dateText }
    };
}

function validateClaimMessage(raw) {
    const message = clean(raw);
    const errors = [];

    if (!message) {
        errors.push('Please explain how you can prove this item is yours.');
    } else {
        const problem = lengthProblem('Your proof of ownership', message, LIMITS.claim);
        if (problem) errors.push(problem);
    }

    return { errors, values: { message } };
}

const cleanSearch = (value) => clean(typeof value === 'string' ? value : '').slice(0, LIMITS.search.max);

module.exports = {
    LIMITS, validateRegistration, validateLogin, validateItem,
    validateClaimMessage, cleanSearch, parseRealDate
};
