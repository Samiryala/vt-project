/**
 * News Routes
 * 
 * API endpoints for news and notifications.
 * Simple read-only from database.
 */

import express from 'express';
import {
  getTodaysNews,
  getTodaysReleases,
  getAllReleases,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead
} from '../controllers/newsController.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * GET /api/news/today
 * Get today's news articles
 */
router.get('/today', verifyToken, getTodaysNews);

export default router;
