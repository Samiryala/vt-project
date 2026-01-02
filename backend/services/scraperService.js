/**
 * Scraper Service
 * 
 * Manages daily execution control for scraping scripts.
 * Each script runs at most once per day, using the database as the source of truth.
 */

import { query } from '../config/database.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the root directory where scraping scripts are located
const ROOT_DIR = path.resolve(__dirname, '..', '..');

/**
 * Ensure script_executions table exists
 */
export const ensureExecutionTable = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS script_executions (
      id SERIAL PRIMARY KEY,
      script_name VARCHAR(100) UNIQUE NOT NULL,
      last_execution_date DATE NOT NULL,
      execution_status VARCHAR(50) DEFAULT 'success',
      details JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  
  try {
    await query(createTableQuery);
    console.log('✓ script_executions table ready');
  } catch (error) {
    console.error('Error creating script_executions table:', error);
    throw error;
  }
};

/**
 * Get today's date in YYYY-MM-DD format
 */
const getTodayDate = () => {
  return new Date().toISOString().split('T')[0];
};

/**
 * Check if a script has already run today
 */
export const hasRunToday = async (scriptName) => {
  const today = getTodayDate();
  
  try {
    const result = await query(
      'SELECT last_execution_date FROM script_executions WHERE script_name = $1',
      [scriptName]
    );
    
    if (result.rows.length === 0) {
      return false;
    }
    
    const lastDate = new Date(result.rows[0].last_execution_date).toISOString().split('T')[0];
    return lastDate === today;
  } catch (error) {
    console.error(`Error checking execution status for ${scriptName}:`, error);
    return false;
  }
};

/**
 * Update the execution state for a script
 */
export const updateExecutionState = async (scriptName, status = 'success', details = {}) => {
  const today = getTodayDate();
  
  const upsertQuery = `
    INSERT INTO script_executions (script_name, last_execution_date, execution_status, details, updated_at)
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
    ON CONFLICT (script_name)
    DO UPDATE SET 
      last_execution_date = EXCLUDED.last_execution_date,
      execution_status = EXCLUDED.execution_status,
      details = EXCLUDED.details,
      updated_at = CURRENT_TIMESTAMP
  `;
  
  try {
    await query(upsertQuery, [scriptName, today, status, JSON.stringify(details)]);
    console.log(`✓ Updated execution state for ${scriptName}`);
  } catch (error) {
    console.error(`Error updating execution state for ${scriptName}:`, error);
    throw error;
  }
};

/**
 * Run a scraping script as a child process
 */
const runScript = (scriptPath) => {
  return new Promise((resolve, reject) => {
    console.log(`🚀 Running script: ${scriptPath}`);
    
    const child = spawn('node', [scriptPath], {
      cwd: ROOT_DIR,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log(data.toString());
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error(data.toString());
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, stdout, stderr });
      } else {
        reject(new Error(`Script exited with code ${code}: ${stderr}`));
      }
    });
    
    child.on('error', (error) => {
      reject(error);
    });
  });
};

/**
 * Run the releases scraper if it hasn't run today
 * Returns: { ran: boolean, newReleases: array }
 */
export const runReleasesScraperIfNeeded = async () => {
  const scriptName = 'scrappingreles';
  
  // Check if already ran today
  if (await hasRunToday(scriptName)) {
    console.log(`ℹ️ ${scriptName} already ran today. Skipping.`);
    return { ran: false, newReleases: [] };
  }
  
  try {
    // Get existing releases before scraping
    const beforeResult = await query('SELECT name, version FROM releases');
    const beforeReleases = new Set(beforeResult.rows.map(r => `${r.name}:${r.version}`));
    
    // Run the scraper script
    const scriptPath = path.join(ROOT_DIR, 'scrappingreles.js');
    await runScript(scriptPath);
    
    // Get releases after scraping
    const afterResult = await query('SELECT id, name, version, release_url, scraped_date FROM releases');
    const newReleases = afterResult.rows.filter(r => !beforeReleases.has(`${r.name}:${r.version}`));
    
    // Update execution state
    await updateExecutionState(scriptName, 'success', {
      newReleasesCount: newReleases.length,
      newReleases: newReleases.map(r => ({ name: r.name, version: r.version }))
    });
    
    return { ran: true, newReleases };
  } catch (error) {
    console.error(`Error running ${scriptName}:`, error);
    await updateExecutionState(scriptName, 'error', { error: error.message });
    return { ran: true, newReleases: [], error: error.message };
  }
};

/**
 * Run the news scraper if it hasn't run today
 * Returns: { ran: boolean, newArticlesCount: number }
 */
export const runNewsScraperIfNeeded = async () => {
  const scriptName = 'scrappnews';
  
  // Check if already ran today
  if (await hasRunToday(scriptName)) {
    console.log(`ℹ️ ${scriptName} already ran today. Skipping.`);
    return { ran: false, newArticlesCount: 0 };
  }
  
  try {
    // Get article count before scraping
    const beforeResult = await query('SELECT COUNT(*) as count FROM articles');
    const beforeCount = parseInt(beforeResult.rows[0].count);
    
    // Run the scraper script
    const scriptPath = path.join(ROOT_DIR, 'scrappnews.js');
    await runScript(scriptPath);
    
    // Get article count after scraping
    const afterResult = await query('SELECT COUNT(*) as count FROM articles');
    const afterCount = parseInt(afterResult.rows[0].count);
    const newArticlesCount = afterCount - beforeCount;
    
    // Update execution state
    await updateExecutionState(scriptName, 'success', {
      newArticlesCount,
      totalArticles: afterCount
    });
    
    return { ran: true, newArticlesCount };
  } catch (error) {
    console.error(`Error running ${scriptName}:`, error);
    await updateExecutionState(scriptName, 'error', { error: error.message });
    return { ran: true, newArticlesCount: 0, error: error.message };
  }
};

/**
 * Trigger both scrapers if needed (called on first website visit of the day)
 */
export const triggerDailyScrapers = async () => {
  console.log('📅 Checking daily scraper execution...');
  
  // Ensure the execution table exists
  await ensureExecutionTable();
  
  const results = {
    releases: await runReleasesScraperIfNeeded(),
    news: await runNewsScraperIfNeeded()
  };
  
  return results;
};

/**
 * Get today's news articles
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
 * Get recent new releases (from today)
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

export default {
  ensureExecutionTable,
  hasRunToday,
  updateExecutionState,
  runReleasesScraperIfNeeded,
  runNewsScraperIfNeeded,
  triggerDailyScrapers,
  getTodaysNews,
  getTodaysReleases
};
