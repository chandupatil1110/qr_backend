import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/adminAuth.js';

const router = Router();

// Send Notification — admin only (X-Admin-Key). Previously unauthenticated,
// which let anyone push a message to every user via userIds:["all"].
router.post(
  '/send',
  requireAdmin,
  body('userIds').isArray().withMessage('userIds must be an array of strings/numbers'),
  body('title').trim().notEmpty().withMessage('title is required'),
  body('message').trim().notEmpty().withMessage('message is required'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userIds, title, message, sentBy, notificationType } = req.body;

    try {
      let targetUserIds = [];

      // Check for broadcast
      if (userIds.includes('all') || userIds.includes('*')) {
        const usersRes = await pool.query('SELECT id FROM users');
        targetUserIds = usersRes.rows.map(u => u.id);
      } else {
        targetUserIds = userIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
      }

      if (targetUserIds.length === 0) {
        return res.status(400).json({ error: 'No valid target users found' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const uId of targetUserIds) {
          await client.query(
            `INSERT INTO notifications ("userId", title, message, "isRead", "sentBy", "notificationType", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, false, $4, $5, NOW(), NOW())`,
            [uId, title, message, sentBy || 'admin', notificationType || 'general']
          );
        }
        await client.query('COMMIT');
        return res.status(201).json({ success: true, count: targetUserIds.length });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('Error sending notification:', err);
      return res.status(500).json({ error: err.message });
    }
  }
);

// Get Notifications By User (with Pagination)
// The :userId in the path must be the caller's own id — a user can only
// read their own notifications.
router.get('/user/:userId', requireAuth, async (req, res) => {
  const { userId } = req.params;
  if (String(userId) !== String(req.userId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10) || 20, 1), 100);
  const offset = (page - 1) * limit;

  try {
    const countRes = await pool.query('SELECT COUNT(*)::int FROM notifications WHERE "userId" = $1', [userId]);
    const total = countRes.rows[0].count;

    const r = await pool.query(
      `SELECT id, "userId", title, message, "isRead", "sentBy", "notificationType", "createdAt", "updatedAt"
       FROM notifications
       WHERE "userId" = $1
       ORDER BY "createdAt" DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return res.json({
      items: r.rows,
      page,
      limit,
      total
    });
  } catch (err) {
    console.error('Error fetching user notifications:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Mark Notification Read
router.put('/read/:notificationId', requireAuth, async (req, res) => {
  const notificationId = parseInt(req.params.notificationId, 10);
  if (!Number.isFinite(notificationId)) {
    return res.status(404).json({ error: 'Notification not found' });
  }

  try {
    // Scoped to the caller: someone else's notification looks "not found".
    const r = await pool.query(
      `UPDATE notifications SET "isRead" = true, "updatedAt" = NOW()
       WHERE id = $1 AND "userId" = $2 RETURNING *`,
      [notificationId, req.userId]
    );
    if (!r.rows.length) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    return res.json(r.rows[0]);
  } catch (err) {
    console.error('Error marking notification read:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Delete Notification
router.delete('/:notificationId', requireAuth, async (req, res) => {
  const notificationId = parseInt(req.params.notificationId, 10);
  if (!Number.isFinite(notificationId)) {
    return res.status(404).json({ error: 'Notification not found' });
  }

  try {
    const r = await pool.query(
      'DELETE FROM notifications WHERE id = $1 AND "userId" = $2 RETURNING id',
      [notificationId, req.userId]
    );
    if (!r.rows.length) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    return res.json({ success: true, deletedId: notificationId });
  } catch (err) {
    console.error('Error deleting notification:', err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
