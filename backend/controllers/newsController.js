/**
 * News Controller
 * 
 * Simple API endpoints for news and notifications.
 * Reads from database only - NO scraping.
 */

import newsService from '../services/newsService.js';
import notificationService from '../services/notificationService.js';

/**
 * Get today's news articles
 * GET /api/news/today
 */
export const getTodaysNews = async (req, res) => {
  try {
    const articles = await newsService.getTodaysNews();
    
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
    const releases = await newsService.getTodaysReleases();
    
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
    const releases = await newsService.getAllReleases();
    
    res.json({
      success: true,
      data: {
        releases,
        count: releases.length
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
    // Ensure table exists
    await notificationService.ensureNotificationsTable();
    
    // AUTO-GENERATE: Check for today's releases and create notifications
    await notificationService.generateNotificationsFromTodaysReleases();
    
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
