/**
 * Data Processing Service
 * 
 * Post-scraping processing for raw articles:
 * 1. Validates that content is actual article paragraphs (not ads/menus)
 * 2. Cleans and filters content
 * 3. Assigns categories based on content analysis
 * 4. Moves valid articles to the final articles table
 */

import { query } from '../config/database.js';

// Allowed categories for articles
const ALLOWED_CATEGORIES = ['Key-Value', 'Columnar', 'Graph', 'Document', 'Distributed SQL'];

// Patterns to filter out non-article content
const NOISE_PATTERNS = [
  /subscribe\s+to\s+newsletter/i,
  /sign\s+up\s+for/i,
  /advertisement/i,
  /sponsored\s+content/i,
  /cookie\s+policy/i,
  /privacy\s+policy/i,
  /terms\s+of\s+service/i,
  /all\s+rights\s+reserved/i,
  /follow\s+us\s+on/i,
  /share\s+on\s+(twitter|facebook|linkedin)/i,
  /related\s+articles/i,
  /you\s+may\s+also\s+like/i,
  /click\s+here\s+to/i,
  /learn\s+more\s+about/i,
  /^menu$/i,
  /^navigation$/i,
  /^footer$/i,
  /^header$/i,
];

// Minimum content length for valid articles
const MIN_CONTENT_LENGTH = 100;
const MIN_PARAGRAPH_LENGTH = 30;

/**
 * Determine the category based on title and content
 * Returns null if article doesn't match any allowed category
 */
function determineCategory(title, content) {
  const text = (title + ' ' + (content || '')).toLowerCase();
  
  // Key-Value stores
  if (text.match(/redis|riak|memcached|key-?value|dynamodb|aerospike|valkey|etcd|hazelcast|infinispan/i)) {
    return 'Key-Value';
  }
  
  // Columnar stores
  if (text.match(/cassandra|clickhouse|hbase|columnar|column|wide column|scylladb|bigtable|druid|timeseries|time series|influxdb/i)) {
    return 'Columnar';
  }
  
  // Graph databases
  if (text.match(/neo4j|tigergraph|graph database|graph db|orientdb|arangodb|titan|dgraph|neptune|janusgraph/i)) {
    return 'Graph';
  }
  
  // Document stores
  if (text.match(/mongodb|couchdb|couchbase|document database|documentdb|firestore|ravendb|marklogic|nosql|jnosql|eclipse jnosql/i)) {
    return 'Document';
  }
  
  // Distributed SQL / NewSQL
  if (text.match(/cockroachdb|tidb|yugabytedb|distributed sql|distributed transaction|newsql|vitess|spanner|planetscale|neon|singlestore|postgresql|postgres|database cluster/i)) {
    return 'Distributed SQL';
  }
  
  return null;
}

/**
 * Check if a paragraph is valid article content
 */
function isValidParagraph(text) {
  if (!text || typeof text !== 'string') return false;
  
  const trimmed = text.trim();
  
  // Too short
  if (trimmed.length < MIN_PARAGRAPH_LENGTH) return false;
  
  // Check for noise patterns
  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }
  
  // Check if it's mostly punctuation or special characters
  const alphanumeric = trimmed.replace(/[^a-zA-Z0-9]/g, '');
  if (alphanumeric.length < trimmed.length * 0.5) return false;
  
  return true;
}

/**
 * Clean and validate article content
 * Returns cleaned content or null if invalid
 */
function cleanContent(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') return null;
  
  // Split into paragraphs
  const paragraphs = rawContent.split(/\n+/);
  
  // Filter valid paragraphs
  const validParagraphs = paragraphs
    .map(p => p.trim())
    .filter(isValidParagraph);
  
  if (validParagraphs.length === 0) return null;
  
  // Join cleaned paragraphs
  const cleaned = validParagraphs.join('\n\n');
  
  // Final validation
  if (cleaned.length < MIN_CONTENT_LENGTH) return null;
  
  return cleaned;
}

/**
 * Ensure articles table exists
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
      source TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await query(createTableQuery);
}

/**
 * Process all unprocessed raw articles
 */
export async function processRawArticles() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           Data Processing Service                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\nStarting at: ${new Date().toISOString()}`);
  
  await ensureArticlesTable();
  
  // Get unprocessed raw articles
  const result = await query(
    'SELECT * FROM raw_articles WHERE processed = FALSE ORDER BY created_at ASC'
  );
  
  const rawArticles = result.rows;
  console.log(`\n📋 Found ${rawArticles.length} unprocessed articles`);
  
  if (rawArticles.length === 0) {
    console.log('✓ No articles to process');
    return { processed: 0, inserted: 0, rejected: 0 };
  }
  
  let inserted = 0;
  let rejected = 0;
  let skipped = 0;
  
  for (const article of rawArticles) {
    console.log(`\nProcessing: ${article.title.substring(0, 50)}...`);
    
    // Step 1: Clean and validate content
    const cleanedContent = cleanContent(article.content_text);
    
    if (!cleanedContent && !article.title) {
      console.log('  ✗ Rejected: No valid content');
      rejected++;
      await query('UPDATE raw_articles SET processed = TRUE WHERE id = $1', [article.id]);
      continue;
    }
    
    // Step 2: Determine category
    const category = determineCategory(article.title, cleanedContent || article.content_text);
    
    if (!category) {
      console.log('  ✗ Rejected: No matching category');
      rejected++;
      await query('UPDATE raw_articles SET processed = TRUE WHERE id = $1', [article.id]);
      continue;
    }
    
    // Step 3: Check if already exists in articles table
    const exists = await query('SELECT id FROM articles WHERE url = $1', [article.url]);
    if (exists.rows.length > 0) {
      console.log('  ⏭ Skipped: Already exists');
      skipped++;
      await query('UPDATE raw_articles SET processed = TRUE WHERE id = $1', [article.id]);
      continue;
    }
    
    // Step 4: Insert into final articles table
    try {
      await query(
        `INSERT INTO articles (title, url, author, pubdate, content_text, tags, category, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          article.title,
          article.url,
          article.author,
          article.pubdate,
          cleanedContent || article.content_text,
          article.tags,
          category,
          article.source
        ]
      );
      
      console.log(`  ✓ Inserted [${category}]: ${article.title.substring(0, 40)}...`);
      inserted++;
      
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        console.log('  ⏭ Skipped: Duplicate URL');
        skipped++;
      } else {
        console.error(`  ✗ Error inserting: ${error.message}`);
        rejected++;
      }
    }
    
    // Mark as processed
    await query('UPDATE raw_articles SET processed = TRUE WHERE id = $1', [article.id]);
  }
  
  console.log('\n' + '═'.repeat(60));
  console.log('PROCESSING SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Total processed: ${rawArticles.length}`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Rejected: ${rejected}`);
  console.log(`Skipped (duplicates): ${skipped}`);
  console.log(`\nCompleted at: ${new Date().toISOString()}`);
  
  return { processed: rawArticles.length, inserted, rejected, skipped };
}

/**
 * Get processing statistics
 */
export async function getProcessingStats() {
  const rawCount = await query('SELECT COUNT(*) as count FROM raw_articles WHERE processed = FALSE');
  const processedCount = await query('SELECT COUNT(*) as count FROM raw_articles WHERE processed = TRUE');
  const articleCount = await query('SELECT COUNT(*) as count FROM articles');
  const categoryStats = await query(
    'SELECT category, COUNT(*) as count FROM articles GROUP BY category ORDER BY count DESC'
  );
  
  return {
    pendingRaw: parseInt(rawCount.rows[0].count),
    processedRaw: parseInt(processedCount.rows[0].count),
    totalArticles: parseInt(articleCount.rows[0].count),
    byCategory: categoryStats.rows
  };
}

export default {
  processRawArticles,
  getProcessingStats,
  ALLOWED_CATEGORIES
};
