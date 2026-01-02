/**
 * Scraper Routes
 * 
 * API endpoints for daily scraping automation and news/releases data.
 */

import express from 'express';
import {
  triggerScrapers,
  getTodaysNews,
  getTodaysReleases,
  getAllReleases,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getScraperStatus
} from '../controllers/scraperController.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * POST /api/scraper/trigger
 * Trigger daily scrapers (called on first website visit)
 * Protected - requires authentication
 */
router.post('/trigger', verifyToken, triggerScrapers);

/**
 * GET /api/scraper/status
 * Check if scrapers have run today
 * Protected - requires authentication
 */
router.get('/status', verifyToken, getScraperStatus);

/**
 * GET /api/news/today
 * Get today's news articles
 * Protected - requires authentication
 */
router.get('/news/today', verifyToken, getTodaysNews);

/**
 * GET /api/releases/today
 * Get today's new releases
 * Protected - requires authentication
 */
router.get('/releases/today', verifyToken, getTodaysReleases);

/**
 * GET /api/releases
 * Get all releases
 * Protected - requires authentication
 */
router.get('/releases', verifyToken, getAllReleases);

/**
 * GET /api/notifications
 * Get notifications (optional ?unreadOnly=true)
 * Protected - requires authentication
 */
router.get('/notifications', verifyToken, getNotifications);

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read
 * Protected - requires authentication
 */
router.put('/notifications/read-all', verifyToken, markAllNotificationsRead);

/**
 * PUT /api/notifications/:id/read
 * Mark a specific notification as read
 * Protected - requires authentication
 */
router.put('/notifications/:id/read', verifyToken, markNotificationRead);

export default router;
