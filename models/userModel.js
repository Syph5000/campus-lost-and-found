const pool = require('../config/db').promise();

async function findByEmail(email) {
    const [rows] = await pool.execute(
        'SELECT id, full_name, student_id, email, password, role FROM users WHERE email = ?',
        [email]
    );
    return rows[0] || null;
}

async function findById(id) {
    const [rows] = await pool.execute(
        'SELECT id, full_name, student_id, email, role FROM users WHERE id = ?',
        [id]
    );
    return rows[0] || null;
}

async function existsByStudentIdOrEmail(studentId, email) {
    const [rows] = await pool.execute(
        'SELECT id FROM users WHERE student_id = ? OR email = ?',
        [studentId, email]
    );
    return rows.length > 0;
}

async function emailTaken(email) {
    const [rows] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
    return rows.length > 0;
}

async function studentIdTaken(studentId) {
    const [rows] = await pool.execute('SELECT id FROM users WHERE student_id = ?', [studentId]);
    return rows.length > 0;
}

async function create({ fullName, studentId, email, passwordHash, role = 'student' }) {
    await pool.execute(
        `INSERT INTO users (full_name, student_id, email, password, role)
         VALUES (?, ?, ?, ?, ?)`,
        [fullName, studentId, email, passwordHash, role]
    );
}

// Admin: every user with how many reports and claims they made
async function listWithActivity() {
    const [rows] = await pool.query(
        `SELECT u.id, u.full_name, u.student_id, u.email, u.role, u.created_at,
                (SELECT COUNT(*) FROM items  i WHERE i.user_id = u.id)     AS report_count,
                (SELECT COUNT(*) FROM claims c WHERE c.claimant_id = u.id) AS claim_count
         FROM users u
         ORDER BY u.created_at DESC, u.id DESC`
    );
    return rows;
}

async function setRole(id, role) {
    await pool.execute('UPDATE users SET role = ? WHERE id = ?', [role, id]);
}

async function count() {
    const [[row]] = await pool.query('SELECT COUNT(*) AS total FROM users');
    return Number(row.total);
}

module.exports = {
    findByEmail, findById, existsByStudentIdOrEmail, emailTaken, studentIdTaken, create,
    listWithActivity, setRole, count
};
