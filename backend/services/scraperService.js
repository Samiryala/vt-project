/**
 * Scraper Service (Refactored)
 * 
 * Manages scraping execution with:
 * - 5 executions per day limit
 * - Integration with new scripts folder
 * - Post-processing integration
 */

import { query } from '../config/database.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import dataProcessingService from './dataProcessingService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to backend scripts directory
const SCRIPTS_DIR = path.resolve(__dirname, '..', 'scripts');
const ROOT_DIR = path.resolve(__dirname, '..', '..');

// Maximum manual scraping executions per day
const MAX_DAILY_EXECUTIONS = 5;

// In-memory scraping job state for non-blocking execution
let currentScrapingJob = {
  isRunning: false,
  jobId: null,
  startedAt: null,
  status: 'idle', // idle, running, completed, error
  message: '',
  result: null
};

/**
 * Ensure tables exist
 */
export const ensureTables = async () => {
  // Script executions table
  await query(`
    CREATE TABLE IF NOT EXISTS script_executions (
      id SERIAL PRIMARY KEY,
      script_name VARCHAR(100) UNIQUE NOT NULL,
      last_execution_date DATE NOT NULL,
      execution_status VARCHAR(50) DEFAULT 'success',
      details JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Manual execution counter table
  await query(`
    CREATE TABLE IF NOT EXISTS manual_execution_counts (
      id SERIAL PRIMARY KEY,
      execution_date DATE UNIQUE NOT NULL,
      count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  console.log('✓ Scraper tables ready');
};

/**
 * Get today's date in YYYY-MM-DD format
 */
const getTodayDate = () => {
  return new Date().toISOString().split('T')[0];
};

/**
 * Get the number of manual executions today
 */
export const getManualExecutionCount = async () => {
  const today = getTodayDate();
  
  const result = await query(
    'SELECT count FROM manual_execution_counts WHERE execution_date = $1',
    [today]
  );
  
  return result.rows.length > 0 ? result.rows[0].count : 0;
};

/**
 * Increment manual execution counter
 */
const incrementExecutionCount = async () => {
  const today = getTodayDate();
  
  await query(`
    INSERT INTO manual_execution_counts (execution_date, count)
    VALUES ($1, 1)
    ON CONFLICT (execution_date)
    DO UPDATE SET count = manual_execution_counts.count + 1
  `, [today]);
};

/**
 * Check if manual execution is allowed (under 5/day limit)
 */
export const canExecuteManually = async () => {
  const count = await getManualExecutionCount();
  return count < MAX_DAILY_EXECUTIONS;
};

/**
 * Get remaining manual executions for today
 */
export const getRemainingExecutions = async () => {
  const count = await getManualExecutionCount();
  return Math.max(0, MAX_DAILY_EXECUTIONS - count);
};

/**
 * Check if a script has already run today
 */
export const hasRunToday = async (scriptName) => {
  const today = getTodayDate();
  
  const result = await query(
    'SELECT last_execution_date FROM script_executions WHERE script_name = $1',
    [scriptName]
  );
  
  if (result.rows.length === 0) return false;
  
  const lastDate = new Date(result.rows[0].last_execution_date).toISOString().split('T')[0];
  return lastDate === today;
};

/**
 * Update the execution state for a script
 */
export const updateExecutionState = async (scriptName, status = 'success', details = {}) => {
  const today = getTodayDate();
  
  await query(`
    INSERT INTO script_executions (script_name, last_execution_date, execution_status, details, updated_at)
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
    ON CONFLICT (script_name)
    DO UPDATE SET 
      last_execution_date = EXCLUDED.last_execution_date,
      execution_status = EXCLUDED.execution_status,
      details = EXCLUDED.details,
      updated_at = CURRENT_TIMESTAMP
  `, [scriptName, today, status, JSON.stringify(details)]);
  
  console.log(`✓ Updated execution state for ${scriptName}`);
};

/**
 * Run a scraping script as a child process
 */
const runScript = (scriptPath) => {
  return new Promise((resolve, reject) => {
    console.log(`🚀 Running script: ${scriptPath}`);
    
    const child = spawn('node', [scriptPath], {
      cwd: path.dirname(scriptPath),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
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
    
    child.on('error', reject);
  });
};

/**
 * Run the releases scraper (from scripts folder)
 */
export const runReleasesScraperIfNeeded = async () => {
  const scriptName = 'scrapeReleases';
  
  if (await hasRunToday(scriptName)) {
    console.log(`ℹ️ ${scriptName} already ran today. Skipping.`);
    return { ran: false, newReleases: [] };
  }
  
  try {
    const beforeResult = await query('SELECT name, version FROM releases');
    const beforeReleases = new Set(beforeResult.rows.map(r => `${r.name}:${r.version}`));
    
    const scriptPath = path.join(SCRIPTS_DIR, 'scrapeReleases.js');
    await runScript(scriptPath);
    
    const afterResult = await query('SELECT id, name, version, release_url, scraped_date FROM releases');
    const newReleases = afterResult.rows.filter(r => !beforeReleases.has(`${r.name}:${r.version}`));
    
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
 * Run the news scraper (new version from scripts folder)
 */
export const runNewsScraperIfNeeded = async () => {
  const scriptName = 'scrapeNews';
  
  if (await hasRunToday(scriptName)) {
    console.log(`ℹ️ ${scriptName} already ran today. Skipping.`);
    return { ran: false, newArticlesCount: 0 };
  }
  
  try {
    const beforeResult = await query('SELECT COUNT(*) as count FROM articles');
    const beforeCount = parseInt(beforeResult.rows[0].count);
    
    // Run the new scraper from scripts folder
    const scriptPath = path.join(SCRIPTS_DIR, 'scrapeNews.js');
    await runScript(scriptPath);
    
    // Run post-processing
    console.log('\n🔄 Running post-processing...');
    const processingResult = await dataProcessingService.processRawArticles();
    
    const afterResult = await query('SELECT COUNT(*) as count FROM articles');
    const afterCount = parseInt(afterResult.rows[0].count);
    const newArticlesCount = afterCount - beforeCount;
    
    await updateExecutionState(scriptName, 'success', {
      newArticlesCount,
      totalArticles: afterCount,
      processing: processingResult
    });
    
    console.log('📰 News scraping and processing completed');
    console.log(`   New articles: ${newArticlesCount}, Total: ${afterCount}`);
    
    return { ran: true, newArticlesCount, processing: processingResult };
  } catch (error) {
    console.error(`Error running ${scriptName}:`, error);
    await updateExecutionState(scriptName, 'error', { error: error.message });
    return { ran: true, newArticlesCount: 0, error: error.message };
  }
};

/**
 * Trigger daily scrapers (automatic - on server start)
 */
export const triggerDailyScrapers = async () => {
  console.log('📅 Checking daily scraper execution...');
  
  await ensureTables();
  
  const results = {
    releases: await runReleasesScraperIfNeeded(),
    news: await runNewsScraperIfNeeded()
  };
  
  console.log('✓ Daily scrapers check completed');
  return results;
};

/**
 * Manual scraping execution (with 5/day limit)
 */
export const triggerManualScraping = async (options = {}) => {
  const { scrapeNews = true, scrapeReleases = true } = options;
  
  // Check limit
  if (!await canExecuteManually()) {
    const remaining = await getRemainingExecutions();
    return {
      success: false,
      error: 'Daily limit reached',
      message: `Maximum ${MAX_DAILY_EXECUTIONS} manual executions per day. Remaining: ${remaining}`,
      remaining: 0
    };
  }
  
  // Increment counter
  await incrementExecutionCount();
  
  const results = {
    success: true,
    timestamp: new Date().toISOString(),
    releases: null,
    news: null
  };
  
  // Run scrapers (bypass daily check for manual execution)
  if (scrapeReleases) {
    try {
      const beforeResult = await query('SELECT name, version FROM releases');
      const beforeReleases = new Set(beforeResult.rows.map(r => `${r.name}:${r.version}`));
      
      const scriptPath = path.join(SCRIPTS_DIR, 'scrapeReleases.js');
      await runScript(scriptPath);
      
      const afterResult = await query('SELECT id, name, version, release_url FROM releases');
      const newReleases = afterResult.rows.filter(r => !beforeReleases.has(`${r.name}:${r.version}`));
      
      results.releases = { success: true, newReleases };
    } catch (error) {
      results.releases = { success: false, error: error.message };
    }
  }
  
  if (scrapeNews) {
    try {
      const beforeCount = (await query('SELECT COUNT(*) as count FROM articles')).rows[0].count;
      
      const scriptPath = path.join(SCRIPTS_DIR, 'scrapeNews.js');
      await runScript(scriptPath);
      
      // Run processing
      const processingResult = await dataProcessingService.processRawArticles();
      
      const afterCount = (await query('SELECT COUNT(*) as count FROM articles')).rows[0].count;
      
      results.news = {
        success: true,
        newArticles: parseInt(afterCount) - parseInt(beforeCount),
        processing: processingResult
      };
    } catch (error) {
      results.news = { success: false, error: error.message };
    }
  }
  
  results.remaining = await getRemainingExecutions();
  
  return results;
};

/**
 * Get current scraping job status
 */
export const getScrapingJobStatus = () => {
  return { ...currentScrapingJob };
};

/**
 * Start non-blocking manual scraping
 * Returns immediately with job ID, runs scraping in background
 */
export const startNonBlockingScraping = async (options = {}) => {
  const { scrapeNews = true, scrapeReleases = true } = options;
  
  // Check if already running
  if (currentScrapingJob.isRunning) {
    return {
      success: false,
      error: 'Scraping already in progress',
      message: 'Un scraping est déjà en cours. Veuillez patienter.',
      jobId: currentScrapingJob.jobId,
      status: currentScrapingJob.status
    };
  }
  
  // Check limit
  if (!await canExecuteManually()) {
    const remaining = await getRemainingExecutions();
    return {
      success: false,
      error: 'Daily limit reached',
      message: `Maximum ${MAX_DAILY_EXECUTIONS} exécutions manuelles par jour. Restant: ${remaining}`,
      remaining: 0
    };
  }
  
  // Generate job ID
  const jobId = `scrape_${Date.now()}`;
  
  // Update job state
  currentScrapingJob = {
    isRunning: true,
    jobId,
    startedAt: new Date().toISOString(),
    status: 'running',
    message: 'Scraping en cours...',
    result: null
  };
  
  // Increment counter immediately
  await incrementExecutionCount();
  const remaining = await getRemainingExecutions();
  
  // Run scraping in background (don't await)
  runScrapingInBackground(scrapeNews, scrapeReleases).catch(err => {
    console.error('Background scraping error:', err);
    currentScrapingJob.status = 'error';
    currentScrapingJob.message = 'Erreur lors du scraping';
    currentScrapingJob.isRunning = false;
  });
  
  return {
    success: true,
    message: 'Scraping démarré en arrière-plan',
    jobId,
    status: 'running',
    remaining
  };
};

/**
 * Internal: Run scraping in background
 */
const runScrapingInBackground = async (scrapeNews, scrapeReleases) => {
  const results = {
    timestamp: new Date().toISOString(),
    releases: null,
    news: null
  };
  
  try {
    if (scrapeReleases) {
      try {
        currentScrapingJob.message = 'Scraping des releases...';
        const beforeResult = await query('SELECT name, version FROM releases');
        const beforeReleases = new Set(beforeResult.rows.map(r => `${r.name}:${r.version}`));
        
        const scriptPath = path.join(SCRIPTS_DIR, 'scrapeReleases.js');
        await runScript(scriptPath);
        
        const afterResult = await query('SELECT id, name, version, release_url FROM releases');
        const newReleases = afterResult.rows.filter(r => !beforeReleases.has(`${r.name}:${r.version}`));
        
        results.releases = { success: true, newReleasesCount: newReleases.length };
      } catch (error) {
        results.releases = { success: false, error: error.message };
      }
    }
    
    if (scrapeNews) {
      try {
        currentScrapingJob.message = 'Scraping des articles...';
        const beforeCount = (await query('SELECT COUNT(*) as count FROM articles')).rows[0].count;
        
        const scriptPath = path.join(SCRIPTS_DIR, 'scrapeNews.js');
        await runScript(scriptPath);
        
        // Run processing
        currentScrapingJob.message = 'Traitement des articles...';
        await dataProcessingService.processRawArticles();
        
        const afterCount = (await query('SELECT COUNT(*) as count FROM articles')).rows[0].count;
        const newArticles = parseInt(afterCount) - parseInt(beforeCount);
        
        results.news = { success: true, newArticles };
      } catch (error) {
        results.news = { success: false, error: error.message };
      }
    }
    
    // Update job state to completed
    currentScrapingJob.status = 'completed';
    currentScrapingJob.message = 'Scraping terminé';
    currentScrapingJob.result = results;
    currentScrapingJob.isRunning = false;
    
    console.log('✅ Background scraping completed:', results);
    
  } catch (error) {
    currentScrapingJob.status = 'error';
    currentScrapingJob.message = `Erreur: ${error.message}`;
    currentScrapingJob.isRunning = false;
    console.error('❌ Background scraping error:', error);
  }
};

/**
 * Get today's news articles
 */
export const getTodaysNews = async () => {
  const today = getTodayDate();
  
  const result = await query(
    `SELECT id, title, url, author, pubdate, category, tags, content_text
     FROM articles 
     WHERE DATE(pubdate) = $1
     ORDER BY pubdate DESC`,
    [today]
  );
  
  return result.rows;
};

/**
 * Get today's releases
 */
export const getTodaysReleases = async () => {
  const today = getTodayDate();
  
  const result = await query(
    `SELECT id, name, version, release_url, scraped_date
     FROM releases 
     WHERE DATE(scraped_date) = $1
     ORDER BY scraped_date DESC`,
    [today]
  );
  
  return result.rows;
};

/**
 * Get scraper status
 */
export const getScraperStatus = async () => {
  const remaining = await getRemainingExecutions();
  const executionCount = await getManualExecutionCount();
  
  const newsRan = await hasRunToday('scrapeNews');
  const releasesRan = await hasRunToday('scrapeReleases');
  
  const processingStats = await dataProcessingService.getProcessingStats();
  
  return {
    date: getTodayDate(),
    manualExecutions: {
      used: executionCount,
      remaining,
      max: MAX_DAILY_EXECUTIONS
    },
    dailyScrapers: {
      newsRanToday: newsRan,
      releasesRanToday: releasesRan
    },
    processing: processingStats
  };
};

export default {
  ensureTables,
  hasRunToday,
  canExecuteManually,
  getRemainingExecutions,
  getManualExecutionCount,
  runReleasesScraperIfNeeded,
  runNewsScraperIfNeeded,
  triggerDailyScrapers,
  triggerManualScraping,
  startNonBlockingScraping,
  getScrapingJobStatus,
  getTodaysNews,
  getTodaysReleases,
  getScraperStatus,
  MAX_DAILY_EXECUTIONS
};
