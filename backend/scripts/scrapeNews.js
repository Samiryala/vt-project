/**
 * News Scraper Script
 * 
 * Scrapes articles from DB-Engines and InfoQ
 * - DB-Engines: Unchanged logic
 * - InfoQ: Now fetches ALL paragraphs from article content
 * 
 * Category assignment is now done in post-processing
 */

import puppeteer from 'puppeteer';
import pg from 'pg';

const { Pool } = pg;

// PostgreSQL connection configuration
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'articales-db',
  password: process.env.DB_PASSWORD || '3afsawa7do5ra#oui123',
  port: parseInt(process.env.DB_PORT) || 5432,
});

// Source configurations - LIVE URLs
const SOURCES = [
  {
    id: 'infoq-nosql',
    name: 'InfoQ NoSQL',
    url: 'https://www.infoq.com/nosql/',
    baseUrl: 'https://www.infoq.com',
    type: 'infoq'
  },
  {
    id: 'infoq-data',
    name: 'InfoQ Data',
    url: 'https://www.infoq.com/data/',
    baseUrl: 'https://www.infoq.com',
    type: 'infoq'
  },
  {
    id: 'db-engines',
    name: 'DB-Engines Blog',
    url: 'https://db-engines.com/en/blog',
    baseUrl: 'https://db-engines.com',
    type: 'db-engines'
  },
];

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

/**
 * Parse a date string into a Date object
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  
  const cleaned = dateStr.trim().replace(/^on\s*/i, '').replace(/\s+/g, ' ');
  
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  
  // Handle "10 October 2025" format
  const match = cleaned.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    const monthIndex = new Date(`${month} 1, 2000`).getMonth();
    if (!isNaN(monthIndex)) {
      return new Date(parseInt(year), monthIndex, parseInt(day));
    }
  }
  
  // Handle "Jan 16, 2025" format
  const usMatch = cleaned.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    const monthIndex = new Date(`${month} 1, 2000`).getMonth();
    if (!isNaN(monthIndex)) {
      return new Date(parseInt(year), monthIndex, parseInt(day));
    }
  }
  
  return null;
}

/**
 * Ensure the scrape_state table exists with enhanced tracking
 */
async function ensureScrapeStateTable() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS scrape_state (
      source TEXT PRIMARY KEY,
      last_scrape_date DATE NOT NULL,
      last_scrape_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      articles_added_last_run INTEGER DEFAULT 0,
      total_articles_scraped INTEGER DEFAULT 0
    );
  `;
  await pool.query(createTableQuery);
  
  // Add new columns if they don't exist (for existing tables)
  try {
    await pool.query(`ALTER TABLE scrape_state ADD COLUMN IF NOT EXISTS last_scrape_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    await pool.query(`ALTER TABLE scrape_state ADD COLUMN IF NOT EXISTS articles_added_last_run INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE scrape_state ADD COLUMN IF NOT EXISTS total_articles_scraped INTEGER DEFAULT 0`);
  } catch (e) {
    // Columns may already exist
  }
}

/**
 * Ensure raw_articles table exists (for unprocessed articles)
 */
async function ensureRawArticlesTable() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS raw_articles (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      url TEXT UNIQUE NOT NULL,
      author TEXT,
      pubdate TIMESTAMP,
      content_text TEXT,
      tags TEXT[],
      source TEXT NOT NULL,
      processed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await pool.query(createTableQuery);
  console.log('✓ Table raw_articles ready');
}

/**
 * Get the last scrape date for a source
 */
async function getLastScrapeDate(sourceId) {
  const result = await pool.query(
    'SELECT last_scrape_date FROM scrape_state WHERE source = $1',
    [sourceId]
  );
  return result.rows.length === 0 ? null : result.rows[0].last_scrape_date;
}

/**
 * Update the last scrape date for a source with tracking info
 */
async function updateScrapeState(sourceId, date, articlesAdded = 0) {
  const query = `
    INSERT INTO scrape_state (source, last_scrape_date, last_scrape_timestamp, articles_added_last_run, total_articles_scraped)
    VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $3)
    ON CONFLICT (source)
    DO UPDATE SET 
      last_scrape_date = EXCLUDED.last_scrape_date,
      last_scrape_timestamp = CURRENT_TIMESTAMP,
      articles_added_last_run = $3,
      total_articles_scraped = scrape_state.total_articles_scraped + $3
  `;
  await pool.query(query, [sourceId, date, articlesAdded]);
  console.log(`✓ Updated scrape_state for ${sourceId} to ${date} (${articlesAdded} articles added)`);
}

/**
 * Insert raw articles (without category - processing comes later)
 */
async function insertRawArticles(articles, sourceId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    let inserted = 0;
    let skipped = 0;
    
    for (const article of articles) {
      // Check if article already exists
      const exists = await client.query(
        'SELECT id FROM raw_articles WHERE url = $1',
        [article.url]
      );
      
      if (exists.rows.length > 0) {
        skipped++;
        continue;
      }
      
      // Also check processed articles table
      const existsProcessed = await client.query(
        'SELECT id FROM articles WHERE url = $1',
        [article.url]
      );
      
      if (existsProcessed.rows.length > 0) {
        skipped++;
        continue;
      }
      
      // Insert the raw article
      await client.query(
        `INSERT INTO raw_articles (title, url, author, pubdate, content_text, tags, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          article.title,
          article.url,
          article.author || null,
          article.pubdate,
          article.content_text || null,
          article.tags || [],
          sourceId
        ]
      );
      
      inserted++;
      console.log(`  ✓ Inserted raw: ${article.title.substring(0, 50)}...`);
    }
    
    await client.query('COMMIT');
    return { inserted, skipped };
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Extract articles from InfoQ page
 * Now also fetches article detail page to get ALL paragraphs
 */
async function extractInfoQArticles(browser, page, source) {
  const articleCards = await page.evaluate((baseUrl) => {
    const articles = [];
    const cards = document.querySelectorAll('li[data-path*="/news/"], li[data-path*="/articles/"], .card');
    
    cards.forEach(card => {
      try {
        let dataPath = card.getAttribute('data-path');
        
        if (!dataPath) {
          const linkEl = card.querySelector('a[href*="/news/"], a[href*="/articles/"]');
          if (linkEl) dataPath = linkEl.getAttribute('href');
        }
        
        if (!dataPath) return;
        if (!dataPath.includes('/news/') && !dataPath.includes('/articles/')) return;
        
        let url = dataPath.split('?')[0];
        if (!url.startsWith('http')) url = baseUrl + url;
        
        const titleEl = card.querySelector('h3.card__title a, h4.card__title a, .card__title a, h3 a, h4 a');
        const title = titleEl ? titleEl.textContent.trim() : null;
        if (!title) return;
        
        const authorEl = card.querySelector('.card__authors a, .authors a, .author a');
        const author = authorEl ? authorEl.textContent.trim() : null;
        
        const dateEl = card.querySelector('.card__date span, .date span, time, .card__date');
        const dateText = dateEl ? (dateEl.getAttribute('datetime') || dateEl.textContent.trim()) : null;
        
        const topicEls = card.querySelectorAll('.card__topics a, .topics a, .tags a');
        const tags = Array.from(topicEls).map(el => el.textContent.trim()).filter(t => t);
        
        articles.push({ title, url, author, dateText, tags });
      } catch (e) {}
    });
    
    return articles;
  }, source.baseUrl);
  
  // Now fetch full content for each article by visiting the article page
  const fullArticles = [];
  
  for (const article of articleCards) {
    try {
      console.log(`    📄 Fetching full content: ${article.title.substring(0, 40)}...`);
      
      const articlePage = await browser.newPage();
      await articlePage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      try {
        await articlePage.goto(article.url, { waitUntil: 'networkidle2', timeout: 15000 });
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Extract ALL paragraphs from the article content
        const fullContent = await articlePage.evaluate(() => {
          const paragraphs = [];
          
          // Main article content selectors
          const contentSelectors = [
            'article .article__content p',
            '.article-body p',
            '.article__text p',
            '.content-body p',
            'article p',
            '.post-content p',
            '.entry-content p'
          ];
          
          for (const selector of contentSelectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
              elements.forEach(p => {
                const text = p.textContent.trim();
                // Filter out short texts (likely nav, ads, etc.)
                if (text.length > 50) {
                  paragraphs.push(text);
                }
              });
              break;
            }
          }
          
          return paragraphs.join('\n\n');
        });
        
        fullArticles.push({
          ...article,
          content_text: fullContent || ''
        });
        
      } finally {
        await articlePage.close();
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.log(`    ⚠ Could not fetch article: ${error.message}`);
      fullArticles.push({ ...article, content_text: '' });
    }
  }
  
  return fullArticles;
}

/**
 * Extract articles from DB-Engines page (UNCHANGED)
 */
async function extractDBEnginesArticles(page, source) {
  return await page.evaluate((baseUrl) => {
    const articles = [];
    const blogEntries = document.querySelectorAll('.blog_index');
    
    blogEntries.forEach(entry => {
      try {
        const titleLink = entry.querySelector('a.blog_header');
        if (!titleLink) return;
        
        const title = titleLink.textContent.trim();
        let url = titleLink.getAttribute('href');
        if (!url) return;
        
        if (!url.startsWith('http')) url = baseUrl + url;
        
        const metaSpan = entry.querySelector('.blog_date');
        let author = null;
        let dateText = null;
        
        if (metaSpan) {
          const metaText = metaSpan.textContent;
          
          const authorLink = metaSpan.querySelector('a.nound');
          const sponsorSpan = metaSpan.querySelector('.blog_sponsor');
          
          if (authorLink) {
            author = authorLink.textContent.trim();
          } else if (sponsorSpan) {
            author = sponsorSpan.textContent.trim();
          } else {
            const byMatch = metaText.match(/by\s+([^,]+),/);
            if (byMatch) author = byMatch[1].trim();
          }
          
          const dateMatch = metaText.match(/(\d{1,2}\s+\w+\s+\d{4})/);
          if (dateMatch) dateText = dateMatch[1];
        }
        
        const paragraphs = entry.querySelectorAll('p');
        let content_text = null;
        for (const p of paragraphs) {
          if (!p.querySelector('.blog_date') && !p.querySelector('a.blog_header')) {
            const text = p.textContent.trim();
            if (text && text.length > 20) {
              content_text = text;
              break;
            }
          }
        }
        
        const tagLinks = metaSpan ? metaSpan.querySelectorAll('a.nound[href*="/blog/"]') : [];
        const tags = Array.from(tagLinks).map(el => el.textContent.trim()).filter(tag => tag && !tag.includes('Tags'));
        
        articles.push({ title, url, author, dateText, content_text, tags });
      } catch (e) {}
    });
    
    return articles;
  }, source.baseUrl);
}

/**
 * Navigate to URL with retries
 */
async function navigateWithRetry(page, url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      return true;
    } catch (error) {
      console.log(`  ⚠ Attempt ${attempt}/${maxRetries} failed: ${error.message}`);
      if (attempt === maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
  return false;
}

/**
 * Process a single source
 */
async function processSource(browser, source) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Processing source: ${source.name} (${source.id})`);
  console.log(`URL: ${source.url}`);
  console.log('='.repeat(60));
  
  const today = getTodayDate();
  const todayDate = new Date(today);
  
  const lastScrapeDate = await getLastScrapeDate(source.id);
  
  if (lastScrapeDate) {
    const lastDate = new Date(lastScrapeDate).toISOString().split('T')[0];
    if (lastDate === today) {
      console.log(`⏭ Already scraped today (${today}). Skipping.`);
      return { source: source.id, status: 'skipped', reason: 'already scraped today' };
    }
    console.log(`Last scrape: ${lastDate}`);
  } else {
    console.log('First time scraping this source');
  }
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  
  try {
    console.log(`  🌐 Fetching: ${source.url}`);
    await navigateWithRetry(page, source.url);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    let articles;
    if (source.type === 'infoq') {
      articles = await extractInfoQArticles(browser, page, source);
    } else if (source.type === 'db-engines') {
      articles = await extractDBEnginesArticles(page, source);
    } else {
      articles = [];
    }
    
    console.log(`  📰 Found ${articles.length} articles on page`);
    
    // Filter by date
    const filteredArticles = [];
    
    for (const article of articles) {
      const pubdate = parseDate(article.dateText);
      
      if (!pubdate) {
        filteredArticles.push({ ...article, pubdate: todayDate });
        continue;
      }
      
      if (pubdate > todayDate) continue;
      
      const articleDateStr = pubdate.toISOString().split('T')[0];
      let shouldScrape = false;
      
      if (articleDateStr === today) {
        shouldScrape = true;
      } else if (lastScrapeDate) {
        if (pubdate > new Date(lastScrapeDate)) shouldScrape = true;
      } else {
        shouldScrape = true;
      }
      
      if (shouldScrape) {
        filteredArticles.push({ ...article, pubdate });
      }
    }
    
    console.log(`  📋 Articles in date range: ${filteredArticles.length}`);
    
    if (filteredArticles.length === 0) {
      console.log('  ℹ No new articles to insert');
      await updateScrapeState(source.id, today, 0);
      return { source: source.id, status: 'success', inserted: 0, skipped: 0 };
    }
    
    // Insert raw articles (without category)
    const { inserted, skipped } = await insertRawArticles(filteredArticles, source.id);
    
    console.log(`\n  Summary for ${source.name}:`);
    console.log(`    - Inserted to raw: ${inserted}`);
    console.log(`    - Skipped (duplicates): ${skipped}`);
    
    await updateScrapeState(source.id, today, inserted);
    
    return { source: source.id, status: 'success', inserted, skipped };
    
  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`);
    return { source: source.id, status: 'error', error: error.message };
  } finally {
    await page.close();
  }
}

/**
 * Main scraping function - exported for use by service
 */
export async function runNewsScraper() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║      News Scraping Agent - LIVE from InfoQ & DB-Engines  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\nStarting at: ${new Date().toISOString()}`);
  console.log(`Today's date: ${getTodayDate()}`);
  
  let browser;
  const results = { totalInserted: 0, totalSkipped: 0, sources: [] };
  
  try {
    await ensureScrapeStateTable();
    await ensureRawArticlesTable();
    
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    console.log('✓ Puppeteer browser launched');
    
    for (const source of SOURCES) {
      try {
        const result = await processSource(browser, source);
        results.sources.push(result);
        if (result.inserted) results.totalInserted += result.inserted;
        if (result.skipped) results.totalSkipped += result.skipped;
      } catch (error) {
        console.error(`Error processing ${source.id}:`, error.message);
        results.sources.push({ source: source.id, status: 'error', error: error.message });
      }
    }
    
    console.log('\n' + '═'.repeat(60));
    console.log('SCRAPING SUMMARY');
    console.log('═'.repeat(60));
    console.log(`Total raw articles inserted: ${results.totalInserted}`);
    console.log(`Total duplicates skipped: ${results.totalSkipped}`);
    console.log(`\nCompleted at: ${new Date().toISOString()}`);
    
    return results;
    
  } finally {
    if (browser) {
      await browser.close();
      console.log('\n✓ Browser closed');
    }
    await pool.end();
    console.log('✓ Database connection closed');
  }
}

// Allow running directly
if (process.argv[1] && process.argv[1].includes('scrapeNews.js')) {
  runNewsScraper().catch(console.error);
}
