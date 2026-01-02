/**
 * Notification Service
 * 
 * Handles in-app notifications for new releases and other events.
 */

import { query } from '../config/database.js';

/**
 * Ensure notifications table exists
 */
export const ensureNotificationsTable = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT,
      data JSONB DEFAULT '{}',
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  
  try {
    await query(createTableQuery);
    console.log('✓ notifications table ready');
  } catch (error) {
    console.error('Error creating notifications table:', error);
    throw error;
  }
};

/**
 * Create a notification for a new release
 */
export const createReleaseNotification = async (release) => {
  const insertQuery = `
    INSERT INTO notifications (type, title, message, data)
    VALUES ($1, $2, $3, $4)
    RETURNING id
  `;
  
  // Title format: "New MongoDB release: 7.0.5"
  const title = `New ${release.name} release: ${release.version}`;
  const message = `${release.name} version ${release.version} is now available. Click to view release notes.`;
  const data = {
    releaseId: release.id,
    name: release.name,
    version: release.version,
    releaseUrl: release.release_url
  };
  
  try {
    const result = await query(insertQuery, ['release', title, message, JSON.stringify(data)]);
    console.log(`✓ Created notification for ${release.name} ${release.version}`);
    return result.rows[0].id;
  } catch (error) {
    console.error('Error creating release notification:', error);
    return null;
  }
};

/**
 * Create notifications for multiple releases
 */
export const createReleaseNotifications = async (releases) => {
  await ensureNotificationsTable();
  
  const notifications = [];
  for (const release of releases) {
    const id = await createReleaseNotification(release);
    if (id) notifications.push(id);
  }
  
  return notifications;
};

/**
 * Get unread notifications
 */
export const getUnreadNotifications = async () => {
  try {
    const result = await query(
      `SELECT id, type, title, message, data, created_at
       FROM notifications
       WHERE is_read = FALSE
       ORDER BY created_at DESC
       LIMIT 50`
    );
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching unread notifications:', error);
    return [];
  }
};

/**
 * Get all notifications (with optional limit)
 */
export const getAllNotifications = async (limit = 50) => {
  try {
    const result = await query(
      `SELECT id, type, title, message, data, is_read, created_at
       FROM notifications
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return [];
  }
};

/**
 * Mark a notification as read
 */
export const markAsRead = async (notificationId) => {
  try {
    await query(
      'UPDATE notifications SET is_read = TRUE WHERE id = $1',
      [notificationId]
    );
    return true;
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return false;
  }
};

/**
 * Mark all notifications as read
 */
export const markAllAsRead = async () => {
  try {
    await query('UPDATE notifications SET is_read = TRUE WHERE is_read = FALSE');
    return true;
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return false;
  }
};

/**
 * Get notification count (unread)
 */
export const getUnreadCount = async () => {
  try {
    const result = await query(
      'SELECT COUNT(*) as count FROM notifications WHERE is_read = FALSE'
    );
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error('Error counting unread notifications:', error);
    return 0;
  }
};

/**
 * Check for today's releases and create notifications for any that don't have one yet
 * This is the KEY function that auto-generates notifications from releases
 */
export const generateNotificationsFromTodaysReleases = async () => {
  try {
    await ensureNotificationsTable();
    
    // Get today's date
    const today = new Date().toISOString().split('T')[0];
    
    // Find releases from today that don't have a notification yet
    // We check by looking at the notification data->name and data->version
    const result = await query(`
      SELECT r.id, r.name, r.version, r.release_url
      FROM releases r
      WHERE DATE(r.scraped_date) = $1
      AND NOT EXISTS (
        SELECT 1 FROM notifications n 
        WHERE n.type = 'release' 
        AND n.data->>'name' = r.name 
        AND n.data->>'version' = r.version
      )
    `, [today]);
    
    const newReleases = result.rows;
    
    if (newReleases.length === 0) {
      console.log('No new releases to notify about');
      return { created: 0, releases: [] };
    }
    
    console.log(`Found ${newReleases.length} new release(s) to create notifications for`);
    
    // Create notifications for each new release
    const createdNotifications = [];
    for (const release of newReleases) {
      const notificationId = await createReleaseNotification(release);
      if (notificationId) {
        createdNotifications.push({
          notificationId,
          release: { name: release.name, version: release.version }
        });
      }
    }
    
    return { created: createdNotifications.length, releases: createdNotifications };
  } catch (error) {
    console.error('Error generating notifications from releases:', error);
    return { created: 0, releases: [], error: error.message };
  }
};

export default {
  ensureNotificationsTable,
  createReleaseNotification,
  createReleaseNotifications,
  getUnreadNotifications,
  getAllNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  generateNotificationsFromTodaysReleases
};
