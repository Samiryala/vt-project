import api from './api';

/**
 * News service - handles news and notifications data
 * Reads from database only - no scraping
 */
const newsService = {
  /**
   * Get today's news articles
   */
  getTodaysNews: async () => {
    try {
      const response = await api.get('/news/today');
      return response.data;
    } catch (error) {
      console.error('Error fetching today\'s news:', error);
      return { success: false, data: { articles: [], hasNews: false } };
    }
  },

  /**
   * Get notifications
   */
  getNotifications: async (unreadOnly = false) => {
    try {
      const response = await api.get('/notifications', {
        params: { unreadOnly: unreadOnly ? 'true' : 'false' }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return { success: false, data: { notifications: [], unreadCount: 0 } };
    }
  },

  /**
   * Mark a notification as read
   */
  markNotificationRead: async (notificationId) => {
    try {
      const response = await api.put(`/notifications/${notificationId}/read`);
      return response.data;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return { success: false };
    }
  },

  /**
   * Mark all notifications as read
   */
  markAllNotificationsRead: async () => {
    try {
      const response = await api.put('/notifications/read-all');
      return response.data;
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      return { success: false };
    }
  }
};

export default newsService;
