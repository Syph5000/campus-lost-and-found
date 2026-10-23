const pool = require('../config/db').promise();

async function stats() {
    const [[row]] = await pool.query(
        `SELECT
            COUNT(*) AS total,
            COALESCE(SUM(status = 'lost'), 0)     AS lost,
            COALESCE(SUM(status = 'found'), 0)    AS found,
            COALESCE(SUM(status = 'claimed'), 0)  AS claimed,
            COALESCE(SUM(status = 'returned'), 0) AS returned
         FROM items`
    );

    return {
        total: Number(row.total),
        lost: Number(row.lost),
        found: Number(row.found),
        claimed: Number(row.claimed),
        returned: Number(row.returned)
    };
}

async function listRecent(limit = 4) {
    const [rows] = await pool.query(
        `SELECT items.*, users.full_name AS reporter_name
         FROM items
         LEFT JOIN users ON items.user_id = users.id
         ORDER BY items.created_at DESC, items.id DESC
         LIMIT ${Number(limit)}`
    );
    return rows;
}

async function search({ search = '', type = '' }) {
    let sql = `
        SELECT items.*, users.full_name AS reporter_name
        FROM items
        LEFT JOIN users ON items.user_id = users.id
        WHERE 1 = 1
    `;
    const params = [];

    if (search) {
        sql += `
            AND (items.title LIKE ? OR items.description LIKE ?
                 OR items.category LIKE ? OR items.location LIKE ?)
        `;
        const keyword = `%${search}%`;
        params.push(keyword, keyword, keyword, keyword);
    }

    if (type === 'lost' || type === 'found') {
        sql += ' AND items.item_type = ?';
        params.push(type);
    }

    sql += ' ORDER BY items.created_at DESC, items.id DESC';

    const [rows] = await pool.execute(sql, params);
    return rows;
}

async function findWithReporter(id) {
    const [rows] = await pool.execute(
        `SELECT items.*, users.full_name AS reporter_name
         FROM items
         LEFT JOIN users ON items.user_id = users.id
         WHERE items.id = ?`,
        [id]
    );
    return rows[0] || null;
}

async function findById(id) {
    const [rows] = await pool.execute('SELECT * FROM items WHERE id = ?', [id]);
    return rows[0] || null;
}

async function listByUser(userId) {
    const [rows] = await pool.execute(
        `SELECT items.*,
            (SELECT COUNT(*) FROM claims
             WHERE claims.item_id = items.id
               AND claims.status = 'pending') AS pending_claims
         FROM items
         WHERE items.user_id = ?
         ORDER BY items.created_at DESC, items.id DESC`,
        [userId]
    );
    return rows;
}

async function create({ userId, title, description, category, location, date, type, image }) {
    await pool.execute(
        `INSERT INTO items
            (user_id, title, description, category, location,
             date_lost_found, item_type, status, image)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, title, description, category, location, date, type, type, image]
    );
}

// item_type / status are deliberately not editable here
async function update(id, { title, description, category, location, date, image }) {
    await pool.execute(
        `UPDATE items
         SET title = ?, description = ?, category = ?, location = ?,
             date_lost_found = ?, image = ?
         WHERE id = ?`,
        [title, description, category, location, date, image, id]
    );
}

// Marks an item returned and closes any claims still waiting, atomically
async function markReturned(id) {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();
        await connection.execute(`UPDATE items SET status = 'returned' WHERE id = ?`, [id]);
        await connection.execute(
            `UPDATE claims SET status = 'rejected' WHERE item_id = ? AND status = 'pending'`,
            [id]
        );
        await connection.commit();
    } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
    } finally {
        connection.release();
    }
}

async function remove(id) {
    await pool.execute('DELETE FROM items WHERE id = ?', [id]);
}

// Admin: every item with reporter and pending-claim count, optional filters
async function listForAdmin({ search = '', status = '' }) {
    let sql = `
        SELECT items.id, items.title, items.item_type, items.status,
               items.created_at, users.full_name AS reporter_name,
               (SELECT COUNT(*) FROM claims
                WHERE claims.item_id = items.id
                  AND claims.status = 'pending') AS pending_claims
        FROM items
        LEFT JOIN users ON items.user_id = users.id
        WHERE 1 = 1
    `;
    const params = [];

    if (search) {
        sql += ' AND (items.title LIKE ? OR users.full_name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
    }

    if (['lost', 'found', 'claimed', 'returned'].includes(status)) {
        sql += ' AND items.status = ?';
        params.push(status);
    }

    sql += ' ORDER BY items.created_at DESC, items.id DESC LIMIT 200';

    const [rows] = await pool.execute(sql, params);
    return rows;
}

module.exports = {
    stats, listRecent, search, findWithReporter, findById, listByUser,
    create, update, markReturned, remove, listForAdmin
};
