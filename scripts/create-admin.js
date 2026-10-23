// Creates an administrator account, or promotes an existing user to admin.
//
//   ADMIN_PASSWORD='a-strong-password' node scripts/create-admin.js \
//       "Full Name" admin@example.com ADMIN-001
//
// The password comes from the environment so it never appears in shell
// history as a command-line argument or in the repository.
const bcrypt = require('bcryptjs');
const db = require('../config/db');

async function main() {
    const [fullName, emailArg, studentId] = process.argv.slice(2);
    const password = process.env.ADMIN_PASSWORD;

    if (!fullName || !emailArg || !studentId || !password) {
        console.error(
            'Usage: ADMIN_PASSWORD=... node scripts/create-admin.js "Full Name" email student_id'
        );
        process.exit(1);
    }

    if (password.length < 8 || password.length > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        console.error('ADMIN_PASSWORD must be 8-72 characters with at least one letter and one number.');
        process.exit(1);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailArg.trim())) {
        console.error('That email address is not valid.');
        process.exit(1);
    }

    const email = emailArg.trim().toLowerCase();
    const pool = db.promise();

    const [existing] = await pool.execute(
        'SELECT id FROM users WHERE email = ?', [email]
    );

    if (existing.length > 0) {
        await pool.execute("UPDATE users SET role = 'admin' WHERE id = ?", [existing[0].id]);
        console.log(`Existing user ${email} is now an admin.`);
    } else {
        const hash = await bcrypt.hash(password, 10);

        await pool.execute(
            `INSERT INTO users (full_name, student_id, email, password, role)
             VALUES (?, ?, ?, ?, 'admin')`,
            [fullName.trim(), studentId.trim(), email, hash]
        );
        console.log(`Admin account created for ${email}.`);
    }

    await db.promise().end();
}

main().catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
});
