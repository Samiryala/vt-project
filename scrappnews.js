// scrappnews.js
// Scraping and data-ingestion agent for InfoQ and DB-Engines news articles
import puppeteer from 'puppeteer';
import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// PostgreSQL connection configuration
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'articales-db',
  password: '3afsawa7do5ra#oui123',
  port: 5432,
});

// Source configurations
const SOURCES = [
  {
    id: 'infoq-nosql',
    name: 'InfoQ NoSQL',
    category: 'NoSQL',
    files: ['first_page.html'],
    baseUrl: 'https://www.infoq.com',
  },
  {
    id: 'infoq-newsql',
    name: 'InfoQ NewSQL',
    category: 'NewSQL',
    files: ['second-page.html'],
    baseUrl: 'https://www.infoq.com',
  },
  {
    id: 'db-engines',
    name: 'DB-Engines Blog',
    category: 'DB-Engines',
    files: ['page1.html', 'page2.html'],
    baseUrl: 'https://db-engines.com',
  },
];

/**
 * Determine the category based on title and content
 */
function determineCategory(title, content) {
  const text = (title + ' ' + (content || '')).toLowerCase();
  
  // Key-Value stores
  if (text.match(/redis|riak|memcached|key-?value/i)) {
    return 'Key-Value';
  }
  
  // Columnar stores
  if (text.match(/cassandra|clickhouse|hbase|columnar|column|wide column/i)) {
    return 'Columnar';
  }
  
  // Graph databases
  if (text.match(/neo4j|tigergraph|graph|orientdb|arangodb|titan/i)) {
    return 'Graph';
  }
  
  // Document stores
  if (text.match(/mongodb|couchdb|couchbase|document/i)) {
    return 'Document';
  }
  
  // Distributed SQL
  if (text.match(/cockroachdb|tidb|yugabytedb|snowflake|databricks|distributed sql/i)) {
    return 'Distributed SQL';
  }
  
  // Relational databases
  if (text.match(/mysql|postgresql|oracle|sql server|mariadb|relational/i)) {
    return 'Relational';
  }
  
  return 'General';
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

/**
 * Parse a date string into a Date object
 * Handles various formats: "Jan 16, 2025", "16 January 2025", "10 October 2025"
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  
  // Clean the date string
  const cleaned = dateStr.trim().replace(/^on\s*/i, '').replace(/\s+/g, ' ');
  
  // Try parsing directly
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  
  // Handle "10 October 2025" format (DB-Engines)
  const match = cleaned.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    const monthIndex = new Date(`${month} 1, 2000`).getMonth();
    if (!isNaN(monthIndex)) {
      return new Date(parseInt(year), monthIndex, parseInt(day));
    }
  }
  
  return null;
}

/**
 * Ensure the scrape_state table exists
 */
async function ensureScrapeStateTable() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS scrape_state (
      source TEXT PRIMARY KEY,
      last_scrape_date DATE NOT NULL
    );
  `;
  
  try {
    await pool.query(createTableQuery);
    console.log('✓ Table scrape_state ready');
  } catch (error) {
    console.error('Error creating scrape_state table:', error);
    throw error;
  }
}

/**
 * Get the last scrape date for a source
 */
async function getLastScrapeDate(sourceId) {
  const result = await pool.query(
    'SELECT last_scrape_date FROM scrape_state WHERE source = $1',
    [sourceId]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return result.rows[0].last_scrape_date;
}

/**
 * Update the last scrape date for a source
 */
async function updateScrapeState(sourceId, date) {
  const query = `
    INSERT INTO scrape_state (source, last_scrape_date)
    VALUES ($1, $2)
    ON CONFLICT (source)
    DO UPDATE SET last_scrape_date = EXCLUDED.last_scrape_date
  `;
  
  await pool.query(query, [sourceId, date]);
  console.log(`✓ Updated scrape_state for ${sourceId} to ${date}`);
}

/**
 * Check if an article already exists by URL
 */
async function articleExists(url) {
  const result = await pool.query(
    'SELECT id FROM articles WHERE url = $1',
    [url]
  );
  return result.rows.length > 0;
}

/**
 * Insert articles using a transaction
 */
async function insertArticles(articles) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    let inserted = 0;
    let skipped = 0;
    
    for (const article of articles) {
      // Check if article already exists
      const exists = await client.query(
        'SELECT id FROM articles WHERE url = $1',
        [article.url]
      );
      
      if (exists.rows.length > 0) {
        skipped++;
        console.log(`  ⏭ Skipped (exists): ${article.title.substring(0, 50)}...`);
        continue;
      }
      
      // Determine category based on content
      const category = determineCategory(article.title, article.content_text);
      
      // Insert the article
      await client.query(
        `INSERT INTO articles (title, url, author, pubdate, content_text, tags, category)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          article.title,
          article.url,
          article.author || null,
          article.pubdate,
          article.content_text || null,
          article.tags || [],
          category
        ]
      );
      
      inserted++;
      console.log(`  ✓ Inserted [${category}]: ${article.title.substring(0, 50)}...`);
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
 * Extract articles from InfoQ HTML page
 */
async function extractInfoQArticles(page, category, baseUrl) {
  return await page.evaluate((category, baseUrl) => {
    const articles = [];
    
    // Find all article cards (li elements with data-path containing /news/)
    const cards = document.querySelectorAll('li[data-path*="/news/"]');
    
    cards.forEach(card => {
      try {
        // Get the article URL
        const dataPath = card.getAttribute('data-path');
        if (!dataPath || !dataPath.includes('/news/')) return;
        
        // Extract URL without query parameters
        let url = dataPath.split('?')[0];
        if (!url.startsWith('http')) {
          url = baseUrl + url;
        }
        
        // Title
        const titleEl = card.querySelector('h3.card__title a, h4.card__title a');
        const title = titleEl ? titleEl.textContent.trim() : null;
        if (!title) return;
        
        // Author
        const authorEl = card.querySelector('.card__authors a, .authors a');
        const author = authorEl ? authorEl.textContent.trim() : null;
        
        // Date - look for the date span
        const dateEl = card.querySelector('.card__date span, .date span');
        const dateText = dateEl ? dateEl.textContent.trim() : null;
        
        // Excerpt/content
        const excerptEl = card.querySelector('.card__excerpt, p.card__excerpt');
        const content_text = excerptEl ? excerptEl.textContent.trim() : null;
        
        // Topics/tags
        const topicEls = card.querySelectorAll('.card__topics a, .topics a');
        const tags = Array.from(topicEls).map(el => el.textContent.trim());
        
        articles.push({
          title,
          url,
          author,
          dateText,
          content_text,
          tags,
          category
        });
        
      } catch (e) {
        console.error('Error parsing article:', e);
      }
    });
    
    return articles;
  }, category, baseUrl);
}

/**
 * Extract articles from DB-Engines HTML page
 */
async function extractDBEnginesArticles(page, category, baseUrl) {
  return await page.evaluate((category, baseUrl) => {
    const articles = [];
    
    // Find all blog entries
    const blogEntries = document.querySelectorAll('.blog_index');
    
    blogEntries.forEach(entry => {
      try {
        // Title and URL
        const titleLink = entry.querySelector('a.blog_header');
        if (!titleLink) return;
        
        const title = titleLink.textContent.trim();
        let url = titleLink.getAttribute('href');
        if (!url) return;
        
        if (!url.startsWith('http')) {
          url = baseUrl + url;
        }
        
        // Author and date from the blog_date span
        const metaSpan = entry.querySelector('.blog_date');
        let author = null;
        let dateText = null;
        
        if (metaSpan) {
          const metaText = metaSpan.textContent;
          
          // Author - check for linked author or sponsor
          const authorLink = metaSpan.querySelector('a.nound');
          const sponsorSpan = metaSpan.querySelector('.blog_sponsor');
          
          if (authorLink) {
            author = authorLink.textContent.trim();
          } else if (sponsorSpan) {
            author = sponsorSpan.textContent.trim().replace(/^\s*/, '').replace(/\s*$/, '');
          } else {
            // Try to extract from "by Author Name, Date" pattern
            const byMatch = metaText.match(/by\s+([^,]+),/);
            if (byMatch) {
              author = byMatch[1].trim();
            }
          }
          
          // Date - look for date pattern at end
          const dateMatch = metaText.match(/(\d{1,2}\s+\w+\s+\d{4})/);
          if (dateMatch) {
            dateText = dateMatch[1];
          }
        }
        
        // Content excerpt - get the paragraph after the meta info
        const paragraphs = entry.querySelectorAll('p');
        let content_text = null;
        for (const p of paragraphs) {
          // Skip the meta paragraph, get the actual content
          if (!p.querySelector('.blog_date') && !p.querySelector('a.blog_header')) {
            content_text = p.textContent.trim();
            if (content_text && content_text.length > 20) break;
          }
        }
        
        // Tags
        const tagLinks = metaSpan ? metaSpan.querySelectorAll('a.nound[href*="/blog/"]') : [];
        const tags = Array.from(tagLinks)
          .map(el => el.textContent.trim())
          .filter(tag => tag && !tag.includes('Tags'));
        
        articles.push({
          title,
          url,
          author,
          dateText,
          content_text,
          tags,
          category
        });
        
      } catch (e) {
        console.error('Error parsing DB-Engines article:', e);
      }
    });
    
    return articles;
  }, category, baseUrl);
}

/**
 * Process a single source
 */
async function processSource(browser, source) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Processing source: ${source.name} (${source.id})`);
  console.log('='.repeat(60));
  
  const today = getTodayDate();
  const todayDate = new Date(today);
  
  // Check last scrape date
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
  
  // Collect all articles from all files for this source
  const allArticles = [];
  
  for (const file of source.files) {
    const filePath = path.join(__dirname, file);
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      console.log(`  ⚠ File not found: ${file}`);
      continue;
    }
    
    console.log(`  Reading: ${file}`);
    
    // Read the HTML file
    const htmlContent = await fs.readFile(filePath, 'utf-8');
    
    // Create a new page and load the HTML
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
    
    // Extract articles based on source type
    let articles;
    if (source.id.startsWith('infoq')) {
      articles = await extractInfoQArticles(page, source.category, source.baseUrl);
    } else if (source.id === 'db-engines') {
      articles = await extractDBEnginesArticles(page, source.category, source.baseUrl);
    }
    
    await page.close();
    
    console.log(`  Found ${articles.length} articles in ${file}`);
    allArticles.push(...articles);
  }
  
  console.log(`Total articles found: ${allArticles.length}`);
  
  // Parse dates and filter by date range
  // CRITICAL: Scrape if (pubdate > last_scrape_date) OR (DATE(pubdate) == today)
  const filteredArticles = [];
  const todayStr = today; // YYYY-MM-DD format
  
  for (const article of allArticles) {
    const pubdate = parseDate(article.dateText);
    
    if (!pubdate) {
      console.log(`  ⚠ Could not parse date for: ${article.title.substring(0, 40)}... (${article.dateText})`);
      continue;
    }
    
    // Skip future articles
    if (pubdate > todayDate) {
      continue;
    }
    
    // Get article date as YYYY-MM-DD string for comparison
    const articleDateStr = pubdate.toISOString().split('T')[0];
    
    // FILTER LOGIC:
    // - Always scrape today's articles (articleDateStr === todayStr)
    // - Scrape articles published after last_scrape_date (pubdate > lastDate)
    // - Skip articles published on or before last_scrape_date (unless it's today)
    
    let shouldScrape = false;
    
    if (articleDateStr === todayStr) {
      // Always collect today's articles
      shouldScrape = true;
    } else if (lastScrapeDate) {
      const lastDate = new Date(lastScrapeDate);
      // Collect articles published AFTER the last scrape date
      if (pubdate > lastDate) {
        shouldScrape = true;
      }
    } else {
      // First time scraping - collect all historical articles
      shouldScrape = true;
    }
    
    if (shouldScrape) {
      filteredArticles.push({
        ...article,
        pubdate,
      });
    }
  }
  
  console.log(`Articles in date range: ${filteredArticles.length}`);
  
  if (filteredArticles.length === 0) {
    console.log('No new articles to insert');
    await updateScrapeState(source.id, today);
    return { source: source.id, status: 'success', inserted: 0, skipped: 0 };
  }
  
  // Insert articles
  const { inserted, skipped } = await insertArticles(filteredArticles);
  
  console.log(`\nSummary for ${source.name}:`);
  console.log(`  - Inserted: ${inserted}`);
  console.log(`  - Skipped (duplicates): ${skipped}`);
  
  // Update scrape state
  await updateScrapeState(source.id, today);
  
  return { source: source.id, status: 'success', inserted, skipped };
}

/**
 * Main scraping function
 */
async function scrapeNews() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║        News Scraping Agent - InfoQ & DB-Engines          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\nStarting at: ${new Date().toISOString()}`);
  console.log(`Today's date: ${getTodayDate()}`);
  
  let browser;
  
  try {
    // Ensure tables exist
    await ensureScrapeStateTable();
    
    // Launch Puppeteer
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    console.log('✓ Puppeteer browser launched');
    
    // Process each source
    const results = [];
    for (const source of SOURCES) {
      try {
        const result = await processSource(browser, source);
        results.push(result);
      } catch (error) {
        console.error(`Error processing ${source.id}:`, error.message);
        results.push({ source: source.id, status: 'error', error: error.message });
      }
    }
    
    // Final summary
    console.log('\n' + '═'.repeat(60));
    console.log('FINAL SUMMARY');
    console.log('═'.repeat(60));
    
    let totalInserted = 0;
    let totalSkipped = 0;
    
    for (const result of results) {
      console.log(`\n${result.source}:`);
      console.log(`  Status: ${result.status}`);
      if (result.status === 'success') {
        console.log(`  Inserted: ${result.inserted}`);
        console.log(`  Skipped: ${result.skipped}`);
        totalInserted += result.inserted;
        totalSkipped += result.skipped;
      } else if (result.status === 'error') {
        console.log(`  Error: ${result.error}`);
      } else if (result.status === 'skipped') {
        console.log(`  Reason: ${result.reason}`);
      }
    }
    
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Total new articles inserted: ${totalInserted}`);
    console.log(`Total duplicates skipped: ${totalSkipped}`);
    console.log(`\nCompleted at: ${new Date().toISOString()}`);
    
  } catch (error) {
    console.error('Fatal error:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      console.log('\n✓ Browser closed');
    }
    await pool.end();
    console.log('✓ Database connection closed');
  }
}

// Run the scraper
scrapeNews().catch(console.error);
