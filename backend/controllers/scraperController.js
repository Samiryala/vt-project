/**
 * Scraper Controller
 * 
 * Handles API endpoints for triggering scrapers and fetching daily data.
 * Includes manual scraping with 5/day limit.
 */

import scraperService from '../services/scraperService.js';
import notificationService from '../services/notificationService.js';
import dataProcessingService from '../services/dataProcessingService.js';

/**
 * Trigger daily scrapers (automatic)
 * Called on first website visit of the day
 * POST /api/scraper/trigger
 */
export const triggerScrapers = async (req, res) => {
  try {
    console.log('🔄 Scraper trigger requested...');
    
    const results = await scraperService.triggerDailyScrapers();
    
    if (results.releases.newReleases && results.releases.newReleases.length > 0) {
      await notificationService.createReleaseNotifications(results.releases.newReleases);
    }
    
    res.json({
      success: true,
      message: 'Scraper check completed',
      data: {
        releases: {
          ran: results.releases.ran,
          newReleasesCount: results.releases.newReleases?.length || 0
        },
        news: {
          ran: results.news.ran,
          newArticlesCount: results.news.newArticlesCount || 0
        }
      }
    });
  } catch (error) {
    console.error('Error triggering scrapers:', error);
    res.status(500).json({
      success: false,
      message: 'Error triggering scrapers',
      error: error.message
    });
  }
};

/**
 * Manual scraping trigger (with 5/day limit)
 * POST /api/scraper/manual
 * Body: { scrapeNews?: boolean, scrapeReleases?: boolean }
 */
export const triggerManualScraping = async (req, res) => {
  try {
    console.log('🔄 Manual scraping requested...');
    
    const options = {
      scrapeNews: req.body.scrapeNews !== false,
      scrapeReleases: req.body.scrapeReleases !== false
    };
    
    const results = await scraperService.triggerManualScraping(options);
    
    if (!results.success) {
      return res.status(429).json({
        success: false,
        message: results.message,
        remaining: results.remaining
      });
    }
    
    // Create notifications for new releases
    if (results.releases?.success && results.releases.newReleases?.length > 0) {
      await notificationService.createReleaseNotifications(results.releases.newReleases);
    }
    
    res.json({
      success: true,
      message: 'Manual scraping completed',
      data: {
        timestamp: results.timestamp,
        releases: results.releases,
        news: results.news,
        remainingExecutions: results.remaining
      }
    });
  } catch (error) {
    console.error('Error in manual scraping:', error);
    res.status(500).json({
      success: false,
      message: 'Error executing manual scraping',
      error: error.message
    });
  }
};

/**
 * Start non-blocking manual scraping
 * POST /api/scraper/start
 * Returns immediately, scraping runs in background
 */
export const startNonBlockingScraping = async (req, res) => {
  try {
    console.log('🔄 Starting non-blocking scraping...');
    
    const options = {
      scrapeNews: req.body.scrapeNews !== false,
      scrapeReleases: req.body.scrapeReleases !== false
    };
    
    const result = await scraperService.startNonBlockingScraping(options);
    
    if (!result.success) {
      const statusCode = result.error === 'Daily limit reached' ? 429 : 409;
      return res.status(statusCode).json(result);
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error starting scraping:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du démarrage du scraping',
      error: error.message
    });
  }
};

/**
 * Get current scraping job status
 * GET /api/scraper/job-status
 */
export const getScrapingJobStatus = (req, res) => {
  try {
    const status = scraperService.getScrapingJobStatus();
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error getting job status',
      error: error.message
    });
  }
};

/**
 * Get scraper status with execution limits
 * GET /api/scraper/status
 */
export const getScraperStatus = async (req, res) => {
  try {
    const status = await scraperService.getScraperStatus();
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Error checking scraper status:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking scraper status'
    });
  }
};

/**
 * Process raw articles (run data processing)
 * POST /api/scraper/process
 */
export const processArticles = async (req, res) => {
  try {
    console.log('🔄 Processing raw articles...');
    
    const result = await dataProcessingService.processRawArticles();
    
    res.json({
      success: true,
      message: 'Processing completed',
      data: result
    });
  } catch (error) {
    console.error('Error processing articles:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing articles',
      error: error.message
    });
  }
};

/**
 * Get processing statistics
 * GET /api/scraper/processing-stats
 */
export const getProcessingStats = async (req, res) => {
  try {
    const stats = await dataProcessingService.getProcessingStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching processing stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching processing stats'
    });
  }
};

/**
 * Get remaining manual executions for today
 * GET /api/scraper/remaining-executions
 */
export const getRemainingExecutions = async (req, res) => {
  try {
    const remaining = await scraperService.getRemainingExecutions();
    
    res.json({
      success: true,
      data: {
        remaining,
        maxDaily: 5,
        used: 5 - remaining
      }
    });
  } catch (error) {
    console.error('Error fetching remaining executions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching remaining executions'
    });
  }
};

/**
 * Get scraping history by source
 * GET /api/scraper/history
 */
export const getScrapingHistory = async (req, res) => {
  try {
    const { query: dbQuery } = await import('../config/database.js');
    
    const result = await dbQuery(`
      SELECT 
        source,
        last_scrape_date,
        last_scrape_timestamp,
        articles_added_last_run,
        total_articles_scraped
      FROM scrape_state
      ORDER BY last_scrape_timestamp DESC
    `);
    
    res.json({
      success: true,
      data: {
        sources: result.rows,
        lastUpdate: result.rows[0]?.last_scrape_timestamp || null
      }
    });
  } catch (error) {
    console.error('Error fetching scraping history:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching scraping history'
    });
  }
};

/**
 * Get today's news articles
 * GET /api/news/today
 */
export const getTodaysNews = async (req, res) => {
  try {
    const articles = await scraperService.getTodaysNews();
    
    res.json({
      success: true,
      data: {
        articles,
        count: articles.length,
        hasNews: articles.length > 0
      }
    });
  } catch (error) {
    console.error('Error fetching today\'s news:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching today\'s news'
    });
  }
};

/**
 * Get today's new releases
 * GET /api/releases/today
 */
export const getTodaysReleases = async (req, res) => {
  try {
    const releases = await scraperService.getTodaysReleases();
    
    res.json({
      success: true,
      data: {
        releases,
        count: releases.length
      }
    });
  } catch (error) {
    console.error('Error fetching today\'s releases:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching today\'s releases'
    });
  }
};

/**
 * Get all releases
 * GET /api/releases
 */
export const getAllReleases = async (req, res) => {
  try {
    const { query: dbQuery } = await import('../config/database.js');
    
    const result = await dbQuery(
      `SELECT id, name, version, release_url, scraped_date
       FROM releases
       ORDER BY scraped_date DESC, name ASC`
    );
    
    res.json({
      success: true,
      data: {
        releases: result.rows,
        count: result.rows.length
      }
    });
  } catch (error) {
    console.error('Error fetching releases:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching releases'
    });
  }
};

/**
 * Get notifications
 * GET /api/notifications
 */
export const getNotifications = async (req, res) => {
  try {
    const { unreadOnly } = req.query;
    
    let notifications;
    if (unreadOnly === 'true') {
      notifications = await notificationService.getUnreadNotifications();
    } else {
      notifications = await notificationService.getAllNotifications();
    }
    
    const unreadCount = await notificationService.getUnreadCount();
    
    res.json({
      success: true,
      data: {
        notifications,
        unreadCount
      }
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications'
    });
  }
};

/**
 * Mark notification as read
 * PUT /api/notifications/:id/read
 */
export const markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    
    await notificationService.markAsRead(parseInt(id));
    
    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking notification as read'
    });
  }
};

/**
 * Mark all notifications as read
 * PUT /api/notifications/read-all
 */
export const markAllNotificationsRead = async (req, res) => {
  try {
    await notificationService.markAllAsRead();
    
    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking all notifications as read'
    });
  }
};
