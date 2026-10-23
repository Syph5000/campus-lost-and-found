const pool = require('../config/db').promise();

async function hasPending(itemId, claimantId) {
    const [rows] = await pool.execute(
        `SELECT id FROM claims
         WHERE item_id = ? AND claimant_id = ? AND status = 'pending'`,
        [itemId, claimantId]
    );
    return rows.length > 0;
}

async function create({ itemId, claimantId, message }) {
    await pool.execute(
        'INSERT INTO claims (item_id, claimant_id, message) VALUES (?, ?, ?)',
        [itemId, claimantId, message]
    );
}

async function listForItem(itemId) {
    const [rows] = await pool.execute(
        `SELECT claims.id, claims.message, claims.status, claims.created_at,
                users.full_name, users.student_id, users.email
         FROM claims
         JOIN users ON claims.claimant_id = users.id
         WHERE claims.item_id = ?
         ORDER BY claims.created_at DESC, claims.id DESC`,
        [itemId]
    );
    return rows;
}

async function latestByClaimant(itemId, claimantId) {
    const [rows] = await pool.execute(
        `SELECT id, status FROM claims
         WHERE item_id = ? AND claimant_id = ?
         ORDER BY id DESC LIMIT 1`,
        [itemId, claimantId]
    );
    return rows[0] || null;
}

async function listByClaimant(claimantId) {
    const [rows] = await pool.execute(
        `SELECT claims.id, claims.item_id, claims.message, claims.status,
                claims.created_at,
                items.title AS item_title,
                owner.full_name AS owner_name,
                owner.email AS owner_email
         FROM claims
         JOIN items ON claims.item_id = items.id
         JOIN users owner ON items.user_id = owner.id
         WHERE claims.claimant_id = ?
         ORDER BY claims.created_at DESC, claims.id DESC`,
        [claimantId]
    );
    return rows;
}

// Admin queue: claim tickets with item and claimant details
async function listForAdmin(status = '') {
    let sql = `
        SELECT claims.id, claims.item_id, claims.message, claims.status,
               claims.created_at,
               items.title AS item_title, items.status AS item_status,
               claimant.full_name, claimant.student_id, claimant.email
        FROM claims
        JOIN items ON claims.item_id = items.id
        JOIN users claimant ON claims.claimant_id = claimant.id
        WHERE 1 = 1
    `;
    const params = [];

    if (['pending', 'approved', 'rejected'].includes(status)) {
        sql += ' AND claims.status = ?';
        params.push(status);
    }

    sql += ' ORDER BY claims.created_at DESC, claims.id DESC LIMIT 200';

    const [rows] = await pool.execute(sql, params);
    return rows;
}

// Admin dashboard
async function countByStatus() {
    const [[row]] = await pool.query(
        `SELECT
            COALESCE(SUM(status = 'pending'), 0)  AS pending,
            COALESCE(SUM(status = 'approved'), 0) AS approved,
            COALESCE(SUM(status = 'rejected'), 0) AS rejected
         FROM claims`
    );
    return {
        pending: Number(row.pending),
        approved: Number(row.approved),
        rejected: Number(row.rejected)
    };
}

async function listRecent(limit = 8) {
    const [rows] = await pool.query(
        `SELECT claims.id, claims.item_id, claims.status, claims.created_at,
                items.title AS item_title,
                claimant.full_name AS claimant_name
         FROM claims
         JOIN items ON claims.item_id = items.id
         JOIN users claimant ON claims.claimant_id = claimant.id
         ORDER BY claims.created_at DESC, claims.id DESC
         LIMIT ${Number(limit)}`
    );
    return rows;
}

// Approve or reject one claim inside a transaction.
// canManage(ownerId) decides whether the current user may review it.
// Returns { outcome: 'not_found' | 'forbidden' | 'closed' | 'ok', itemId }
async function review(claimId, decision, canManage) {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [rows] = await connection.execute(
            `SELECT claims.id, claims.item_id, claims.status,
                    items.user_id AS owner_id, items.status AS item_status
             FROM claims
             JOIN items ON claims.item_id = items.id
             WHERE claims.id = ?
             FOR UPDATE`,
            [claimId]
        );

        if (rows.length === 0) {
            await connection.rollback();
            return { outcome: 'not_found' };
        }

        const claim = rows[0];

        if (!canManage(claim.owner_id)) {
            await connection.rollback();
            return { outcome: 'forbidden' };
        }

        const itemIsOpen = claim.item_status === 'lost' || claim.item_status === 'found';

        if (claim.status !== 'pending' || !itemIsOpen) {
            await connection.rollback();
            return { outcome: 'closed', itemId: claim.item_id };
        }

        if (decision === 'approve') {
            await connection.execute(
                `UPDATE claims SET status = 'approved' WHERE id = ?`, [claim.id]
            );
            await connection.execute(
                `UPDATE claims SET status = 'rejected'
                 WHERE item_id = ? AND id <> ? AND status = 'pending'`,
                [claim.item_id, claim.id]
            );
            await connection.execute(
                `UPDATE items SET status = 'claimed' WHERE id = ?`, [claim.item_id]
            );
        } else {
            await connection.execute(
                `UPDATE claims SET status = 'rejected' WHERE id = ?`, [claim.id]
            );
        }

        await connection.commit();
        return { outcome: 'ok', itemId: claim.item_id };
    } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    hasPending, create, listForItem, latestByClaimant, listByClaimant,
    listForAdmin, countByStatus, listRecent, review
};
