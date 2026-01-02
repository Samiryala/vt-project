/**
 * News Service
 * 
 * Simple service to fetch today's news from the database.
 * NO scraping - only reads from existing data.
 */

import { query } from '../config/database.js';

/**
 * Get today's date in YYYY-MM-DD format
 */
const getTodayDate = () => {
  return new Date().toISOString().split('T')[0];
};

/**
 * Get today's news articles from database
 * Only returns articles where DATE(pubdate) = today
 */
export const getTodaysNews = async () => {
  const today = getTodayDate();
  
  try {
    const result = await query(
      `SELECT id, title, url, author, pubdate, category, tags, content_text
       FROM articles 
       WHERE DATE(pubdate) = $1
       ORDER BY pubdate DESC`,
      [today]
    );
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching today\'s news:', error);
    return [];
  }
};

/**
 * Get today's releases from database
 * Only returns releases inserted today
 */
export const getTodaysReleases = async () => {
  const today = getTodayDate();
  
  try {
    const result = await query(
      `SELECT id, name, version, release_url, scraped_date
       FROM releases 
       WHERE DATE(scraped_date) = $1
       ORDER BY scraped_date DESC`,
      [today]
    );
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching today\'s releases:', error);
    return [];
  }
};

/**
 * Get all releases
 */
export const getAllReleases = async () => {
  try {
    const result = await query(
      `SELECT id, name, version, release_url, scraped_date
       FROM releases
       ORDER BY scraped_date DESC, name ASC`
    );
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching releases:', error);
    return [];
  }
};

export default {
  getTodaysNews,
  getTodaysReleases,
  getAllReleases
};
