/**
 * Scraper Routes
 * 
 * API endpoints for daily scraping automation and news/releases data.
 * Includes manual scraping with 5/day limit.
 */

import express from 'express';
import {
  triggerScrapers,
  triggerManualScraping,
  startNonBlockingScraping,
  getScrapingJobStatus,
  getTodaysNews,
  getTodaysReleases,
  getAllReleases,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getScraperStatus,
  processArticles,
  getProcessingStats,
  getRemainingExecutions,
  getScrapingHistory
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
 * POST /api/scraper/manual
 * Manually trigger scrapers (limited to 5/day) - BLOCKING
 * Body: { scrapeNews?: boolean, scrapeReleases?: boolean }
 * Protected - requires authentication
 */
router.post('/manual', verifyToken, triggerManualScraping);

/**
 * POST /api/scraper/start
 * Start non-blocking scraping (returns immediately)
 * Body: { scrapeNews?: boolean, scrapeReleases?: boolean }
 * Protected - requires authentication
 */
router.post('/start', verifyToken, startNonBlockingScraping);

/**
 * GET /api/scraper/job-status
 * Get current scraping job status (for polling)
 * Protected - requires authentication
 */
router.get('/job-status', verifyToken, getScrapingJobStatus);

/**
 * POST /api/scraper/process
 * Process raw articles (run data processing)
 * Protected - requires authentication
 */
router.post('/process', verifyToken, processArticles);

/**
 * GET /api/scraper/status
 * Get full scraper status with execution limits
 * Protected - requires authentication
 */
router.get('/status', verifyToken, getScraperStatus);

/**
 * GET /api/scraper/remaining-executions
 * Get remaining manual executions for today
 * Protected - requires authentication
 */
router.get('/remaining-executions', verifyToken, getRemainingExecutions);

/**
 * GET /api/scraper/processing-stats
 * Get processing statistics
 * Protected - requires authentication
 */
router.get('/processing-stats', verifyToken, getProcessingStats);

/**
 * GET /api/scraper/history
 * Get scraping history by source
 * Protected - requires authentication
 */
router.get('/history', verifyToken, getScrapingHistory);

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
