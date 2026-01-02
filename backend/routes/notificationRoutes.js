/**
 * Notification Routes
 * 
 * API endpoints for notifications.
 */

import express from 'express';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead
} from '../controllers/newsController.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * GET /api/notifications
 * Get notifications (optional ?unreadOnly=true)
 */
router.get('/', verifyToken, getNotifications);

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read
 */
router.put('/read-all', verifyToken, markAllNotificationsRead);

/**
 * PUT /api/notifications/:id/read
 * Mark a specific notification as read
 */
router.put('/:id/read', verifyToken, markNotificationRead);

export default router;
