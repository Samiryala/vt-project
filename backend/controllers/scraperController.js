/**
 * Scraper Controller
 * 
 * Handles API endpoints for triggering scrapers and fetching daily data.
 */

import scraperService from '../services/scraperService.js';
import notificationService from '../services/notificationService.js';

/**
 * Trigger daily scrapers
 * Called on first website visit of the day
 * POST /api/scraper/trigger
 */
export const triggerScrapers = async (req, res) => {
  try {
    console.log('🔄 Scraper trigger requested...');
    
    // Trigger both scrapers
    const results = await scraperService.triggerDailyScrapers();
    
    // If new releases were found, create notifications
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

/**
 * Check scraper status (whether they've run today)
 * GET /api/scraper/status
 */
export const getScraperStatus = async (req, res) => {
  try {
    const releasesRan = await scraperService.hasRunToday('scrappingreles');
    const newsRan = await scraperService.hasRunToday('scrappnews');
    
    res.json({
      success: true,
      data: {
        releases: { hasRunToday: releasesRan },
        news: { hasRunToday: newsRan }
      }
    });
  } catch (error) {
    console.error('Error checking scraper status:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking scraper status'
    });
  }
};
