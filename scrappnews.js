// scrappnews.js
// Scraping and data-ingestion agent for InfoQ and DB-Engines news articles
// Scrapes LIVE from websites - no local HTML files needed
import puppeteer from 'puppeteer';
import pg from 'pg';
import { fileURLToPath } from 'url';
import path from 'path';

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

// Source configurations - LIVE URLs
const SOURCES = [
  {
    id: 'infoq-nosql',
    name: 'InfoQ NoSQL',
    category: 'NoSQL',
    url: 'https://www.infoq.com/nosql/',
    baseUrl: 'https://www.infoq.com',
    type: 'infoq'
  },
  {
    id: 'infoq-data',
    name: 'InfoQ Data',
    category: 'Data',
    url: 'https://www.infoq.com/data/',
    baseUrl: 'https://www.infoq.com',
    type: 'infoq'
  },
  {
    id: 'db-engines',
    name: 'DB-Engines Blog',
    category: 'DB-Engines',
    url: 'https://db-engines.com/en/blog',
    baseUrl: 'https://db-engines.com',
    type: 'db-engines'
  },
];

// ALLOWED CATEGORIES - Only these will be inserted
const ALLOWED_CATEGORIES = ['Key-Value', 'Columnar', 'Graph', 'Document', 'Distributed SQL'];

/**
 * Determine the category based on title and content
 * Returns null if article doesn't match any allowed category
 */
function determineCategory(title, content, sourceCategory) {
  const text = (title + ' ' + (content || '')).toLowerCase();
  
  // Key-Value stores
  if (text.match(/redis|riak|memcached|key-?value|dynamodb|aerospike|valkey/i)) {
    return 'Key-Value';
  }
  
  // Columnar stores
  if (text.match(/cassandra|clickhouse|hbase|columnar|column|wide column|scylladb|bigtable/i)) {
    return 'Columnar';
  }
  
  // Graph databases
  if (text.match(/neo4j|tigergraph|graph database|orientdb|arangodb|titan|dgraph|neptune/i)) {
    return 'Graph';
  }
  
  // Document stores
  if (text.match(/mongodb|couchdb|couchbase|document database|documentdb|firestore|ravendb/i)) {
    return 'Document';
  }
  
  // Distributed SQL / NewSQL
  if (text.match(/cockroachdb|tidb|yugabytedb|distributed sql|newsql|vitess|spanner|planetscale|neon/i)) {
    return 'Distributed SQL';
  }
  
  // Return null for articles that don't match any allowed category
  return null;
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
 * Ensure articles table exists with correct schema
 */
async function ensureArticlesTable() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS articles (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      url TEXT UNIQUE NOT NULL,
      author TEXT,
      pubdate TIMESTAMP,
      content_text TEXT,
      tags TEXT[],
      category VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  
  try {
    await pool.query(createTableQuery);
    console.log('✓ Table articles ready');
  } catch (error) {
    console.error('Error creating articles table:', error);
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
 * Insert articles using a transaction
 */
async function insertArticles(articles, sourceCategory) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    let inserted = 0;
    let skipped = 0;
    let rejected = 0;
    
    for (const article of articles) {
      // Determine category based on content FIRST
      const category = determineCategory(article.title, article.content_text, sourceCategory);
      
      // Skip articles that don't match any allowed category
      if (!category) {
        rejected++;
        continue;
      }
      
      // Check if article already exists
      const exists = await client.query(
        'SELECT id FROM articles WHERE url = $1',
        [article.url]
      );
      
      if (exists.rows.length > 0) {
        skipped++;
        continue;
      }
      
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
    
    if (rejected > 0) {
      console.log(`  ⊘ Rejected ${rejected} articles (not in allowed categories)`);
    }
    
    return { inserted, skipped, rejected };
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Extract articles from InfoQ page (LIVE)
 */
async function extractInfoQArticles(page, source) {
  return await page.evaluate((baseUrl) => {
    const articles = [];
    
    // Find all article cards (li elements with data-path containing /news/ or article links)
    const cards = document.querySelectorAll('li[data-path*="/news/"], li[data-path*="/articles/"], .card');
    
    cards.forEach(card => {
      try {
        // Get the article URL
        let dataPath = card.getAttribute('data-path');
        
        // Try alternate selectors if no data-path
        if (!dataPath) {
          const linkEl = card.querySelector('a[href*="/news/"], a[href*="/articles/"]');
          if (linkEl) {
            dataPath = linkEl.getAttribute('href');
          }
        }
        
        if (!dataPath) return;
        
        // Skip non-article paths
        if (!dataPath.includes('/news/') && !dataPath.includes('/articles/')) return;
        
        // Extract URL without query parameters
        let url = dataPath.split('?')[0];
        if (!url.startsWith('http')) {
          url = baseUrl + url;
        }
        
        // Title
        const titleEl = card.querySelector('h3.card__title a, h4.card__title a, .card__title a, h3 a, h4 a');
        const title = titleEl ? titleEl.textContent.trim() : null;
        if (!title) return;
        
        // Author
        const authorEl = card.querySelector('.card__authors a, .authors a, .author a');
        const author = authorEl ? authorEl.textContent.trim() : null;
        
        // Date - look for the date span
        const dateEl = card.querySelector('.card__date span, .date span, time, .card__date');
        const dateText = dateEl ? (dateEl.getAttribute('datetime') || dateEl.textContent.trim()) : null;
        
        // Excerpt/content
        const excerptEl = card.querySelector('.card__excerpt, p.card__excerpt, .excerpt, .summary');
        const content_text = excerptEl ? excerptEl.textContent.trim() : null;
        
        // Topics/tags
        const topicEls = card.querySelectorAll('.card__topics a, .topics a, .tags a');
        const tags = Array.from(topicEls).map(el => el.textContent.trim()).filter(t => t);
        
        articles.push({
          title,
          url,
          author,
          dateText,
          content_text,
          tags
        });
        
      } catch (e) {
        // Skip individual article errors
      }
    });
    
    return articles;
  }, source.baseUrl);
}

/**
 * Extract articles from DB-Engines page (LIVE)
 */
async function extractDBEnginesArticles(page, source) {
  return await page.evaluate((baseUrl) => {
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
            author = sponsorSpan.textContent.trim();
          } else {
            // Try to extract from "by Author Name, Date" pattern
            const byMatch = metaText.match(/by\s+([^,]+),/);
            if (byMatch) {
              author = byMatch[1].trim();
            }
          }
          
          // Date - look for date pattern
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
            const text = p.textContent.trim();
            if (text && text.length > 20) {
              content_text = text;
              break;
            }
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
          tags
        });
        
      } catch (e) {
        // Skip individual article errors
      }
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
      await page.goto(url, { 
        waitUntil: 'networkidle2', 
        timeout: 30000 
      });
      return true;
    } catch (error) {
      console.log(`  ⚠ Attempt ${attempt}/${maxRetries} failed: ${error.message}`);
      if (attempt === maxRetries) {
        throw error;
      }
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
  return false;
}

/**
 * Process a single source - LIVE scraping
 */
async function processSource(browser, source) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Processing source: ${source.name} (${source.id})`);
  console.log(`URL: ${source.url}`);
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
  
  // Create a new page and navigate to live URL
  const page = await browser.newPage();
  
  // Set user agent to avoid blocking
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  try {
    console.log(`  🌐 Fetching: ${source.url}`);
    await navigateWithRetry(page, source.url);
    
    // Wait a moment for dynamic content
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Extract articles based on source type
    let articles;
    if (source.type === 'infoq') {
      articles = await extractInfoQArticles(page, source);
    } else if (source.type === 'db-engines') {
      articles = await extractDBEnginesArticles(page, source);
    } else {
      articles = [];
    }
    
    console.log(`  📰 Found ${articles.length} articles on page`);
    
    // Parse dates and filter by date range
    const filteredArticles = [];
    
    for (const article of articles) {
      const pubdate = parseDate(article.dateText);
      
      if (!pubdate) {
        // If we can't parse the date, include it anyway with today's date
        filteredArticles.push({
          ...article,
          pubdate: todayDate,
        });
        continue;
      }
      
      // Skip future articles
      if (pubdate > todayDate) {
        continue;
      }
      
      // Get article date as YYYY-MM-DD string for comparison
      const articleDateStr = pubdate.toISOString().split('T')[0];
      
      // FILTER LOGIC:
      // - Always scrape today's articles
      // - Scrape articles published after last_scrape_date
      // - On first run, collect all found articles
      
      let shouldScrape = false;
      
      if (articleDateStr === today) {
        shouldScrape = true;
      } else if (lastScrapeDate) {
        const lastDate = new Date(lastScrapeDate);
        if (pubdate > lastDate) {
          shouldScrape = true;
        }
      } else {
        // First time scraping - collect all
        shouldScrape = true;
      }
      
      if (shouldScrape) {
        filteredArticles.push({
          ...article,
          pubdate,
        });
      }
    }
    
    console.log(`  📋 Articles in date range: ${filteredArticles.length}`);
    
    if (filteredArticles.length === 0) {
      console.log('  ℹ No new articles to insert');
      await updateScrapeState(source.id, today);
      return { source: source.id, status: 'success', inserted: 0, skipped: 0, rejected: 0 };
    }
    
    // Insert articles
    const { inserted, skipped, rejected } = await insertArticles(filteredArticles, source.category);
    
    console.log(`\n  Summary for ${source.name}:`);
    console.log(`    - Inserted: ${inserted}`);
    console.log(`    - Skipped (duplicates): ${skipped}`);
    console.log(`    - Rejected (wrong category): ${rejected || 0}`);
    
    // Update scrape state
    await updateScrapeState(source.id, today);
    
    return { source: source.id, status: 'success', inserted, skipped, rejected: rejected || 0 };
    
  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`);
    return { source: source.id, status: 'error', error: error.message };
  } finally {
    await page.close();
  }
}

/**
 * Main scraping function
 */
async function scrapeNews() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║      News Scraping Agent - LIVE from InfoQ & DB-Engines  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\nStarting at: ${new Date().toISOString()}`);
  console.log(`Today's date: ${getTodayDate()}`);
  
  let browser;
  
  try {
    // Ensure tables exist
    await ensureScrapeStateTable();
    await ensureArticlesTable();
    
    // Launch Puppeteer
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
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
    console.log(`Allowed categories: ${ALLOWED_CATEGORIES.join(', ')}`);
    console.log('═'.repeat(60));
    
    let totalInserted = 0;
    let totalSkipped = 0;
    let totalRejected = 0;
    
    for (const result of results) {
      console.log(`\n${result.source}:`);
      console.log(`  Status: ${result.status}`);
      if (result.status === 'success') {
        console.log(`  Inserted: ${result.inserted}`);
        console.log(`  Skipped: ${result.skipped}`);
        console.log(`  Rejected: ${result.rejected || 0}`);
        totalInserted += result.inserted;
        totalSkipped += result.skipped;
        totalRejected += result.rejected || 0;
      } else if (result.status === 'error') {
        console.log(`  Error: ${result.error}`);
      } else if (result.status === 'skipped') {
        console.log(`  Reason: ${result.reason}`);
      }
    }
    
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Total new articles inserted: ${totalInserted}`);
    console.log(`Total duplicates skipped: ${totalSkipped}`);
    console.log(`Total rejected (wrong category): ${totalRejected}`);
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
