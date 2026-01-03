// scrappingreles.js
// Scraping agent for database release notes
// Scrapes LIVE from websites - no local HTML files needed
import puppeteer from 'puppeteer';
import pg from 'pg';
import { fileURLToPath } from 'url';
import path from 'path';

const { Pool } = pg;

// Get current directory for ES modules
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

// Database configurations for LIVE scraping
const databases = [
    {
        name: 'MongoDB',
        releaseUrl: 'https://www.mongodb.com/docs/manual/release-notes/',
        extractVersion: async (page) => {
            return await page.evaluate(() => {
                const versions = [];
                
                // Find version from menu links or release notes mentions
                const links = document.querySelectorAll('a[href*="/release-notes/"]');
                for (const link of links) {
                    const href = link.getAttribute('href') || '';
                    const match = href.match(/release-notes\/(\d+\.\d+)/);
                    if (match) {
                        versions.push(match[1]);
                    }
                }
                
                // Also check for "MongoDB 8.0" text patterns
                const text = document.body.innerText || '';
                const textMatch = text.match(/MongoDB\s+(\d+\.\d+)/gi);
                if (textMatch) {
                    for (const m of textMatch) {
                        const ver = m.match(/(\d+\.\d+)/);
                        if (ver) versions.push(ver[1]);
                    }
                }
                
                // Return the highest version found
                if (versions.length === 0) return null;
                return [...new Set(versions)].sort((a, b) => {
                    const [aMajor, aMinor] = a.split('.').map(Number);
                    const [bMajor, bMinor] = b.split('.').map(Number);
                    return bMajor - aMajor || bMinor - aMinor;
                })[0];
            });
        }
    },
    {
        name: 'Neo4j',
        releaseUrl: 'https://neo4j.com/release-notes/',
        extractVersion: async (page) => {
            return await page.evaluate(() => {
                // Look in the recent releases section
                const databaseSection = document.querySelector('.recent-releases');
                if (databaseSection) {
                    const links = databaseSection.querySelectorAll('a[href*="/database/neo4j-"]');
                    for (const link of links) {
                        const text = link.textContent.trim();
                        const match = text.match(/Neo4j\s+([\d.]+)/i);
                        if (match) {
                            return match[1];
                        }
                    }
                }
                
                // Fallback: search in the whole document for version links
                const allLinks = document.querySelectorAll('a[href*="neo4j-5-"], a[href*="neo4j-2025"], a[href*="neo4j-2024"]');
                for (const link of allLinks) {
                    const href = link.getAttribute('href') || '';
                    const match = href.match(/neo4j-([\d-]+)\/?$/);
                    if (match) {
                        return match[1].replace(/-/g, '.');
                    }
                }
                
                // Try text content as last resort
                const text = document.body.innerText || '';
                const textMatch = text.match(/Neo4j\s+([\d.]+)/i);
                if (textMatch) {
                    return textMatch[1];
                }
                
                return null;
            });
        }
    },
    {
        name: 'Redis',
        releaseUrl: 'https://redis.io/docs/latest/operate/rs/release-notes/',
        extractVersion: async (page) => {
            return await page.evaluate(() => {
                const versions = [];
                const text = document.body.innerText || '';
                
                // Match patterns for Redis versions
                const patterns = [
                    /Redis\s+(?:Enterprise\s+)?(?:Software\s+)?(\d+\.\d+(?:\.\d+)?)/gi,
                    /version\s+(\d+\.\d+(?:\.\d+)?)/gi,
                    /v(\d+\.\d+(?:\.\d+)?)/gi
                ];
                
                for (const pattern of patterns) {
                    let match;
                    while ((match = pattern.exec(text)) !== null) {
                        versions.push(match[1]);
                    }
                }
                
                // Check links to specific version release notes
                const links = document.querySelectorAll('a[href*="release-notes"]');
                for (const link of links) {
                    const href = link.getAttribute('href') || '';
                    const match = href.match(/rs-(\d+)-(\d+)(?:-(\d+))?/);
                    if (match) {
                        versions.push(`${match[1]}.${match[2]}${match[3] ? '.' + match[3] : ''}`);
                    }
                }
                
                // Return highest version
                if (versions.length === 0) return null;
                return [...new Set(versions)].sort((a, b) => {
                    const aParts = a.split('.').map(Number);
                    const bParts = b.split('.').map(Number);
                    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
                        const diff = (bParts[i] || 0) - (aParts[i] || 0);
                        if (diff !== 0) return diff;
                    }
                    return 0;
                })[0];
            });
        }
    },
    {
        name: 'TiDB',
        releaseUrl: 'https://docs.pingcap.com/tidb/stable/release-notes/',
        extractVersion: async (page) => {
            return await page.evaluate(() => {
                // Check meta description
                const metaDesc = document.querySelector('meta[name="description"]');
                if (metaDesc) {
                    const content = metaDesc.getAttribute('content') || '';
                    const match = content.match(/(\d+\.\d+\.\d+(?:-\w+)?)/);
                    if (match) return match[1];
                }
                
                // Look for version in page title or headings
                const title = document.title || '';
                const titleMatch = title.match(/TiDB\s+v?(\d+\.\d+\.\d+)/i);
                if (titleMatch) return titleMatch[1];
                
                // Fallback: search in page content
                const text = document.body.innerText || '';
                const match = text.match(/TiDB\s+v?(\d+\.\d+\.\d+)/i);
                if (match) return match[1];
                
                // Check for version links
                const links = document.querySelectorAll('a[href*="release-"]');
                for (const link of links) {
                    const href = link.getAttribute('href') || '';
                    const match = href.match(/release-(\d+\.\d+\.\d+)/);
                    if (match) return match[1];
                }
                
                return null;
            });
        }
    },
    {
        name: 'YugabyteDB',
        releaseUrl: 'https://docs.yugabyte.com/stable/releases/ybdb-releases/',
        extractVersion: async (page) => {
            return await page.evaluate(() => {
                const versions = [];
                
                // Look for version links in the navigation/content
                const links = document.querySelectorAll('a[href*="/releases/ybdb-releases/v"]');
                for (const link of links) {
                    const href = link.getAttribute('href') || '';
                    const match = href.match(/v(\d{4}\.\d+(?:\.\d+)?|\d+\.\d+(?:\.\d+)?)/);
                    if (match) {
                        versions.push(match[1]);
                    }
                }
                
                // Also look for version text patterns
                const text = document.body.innerText || '';
                const textMatches = text.match(/v(\d{4}\.\d+(?:\.\d+)?)/g);
                if (textMatches) {
                    for (const m of textMatches) {
                        const ver = m.match(/v(\d{4}\.\d+(?:\.\d+)?)/);
                        if (ver) versions.push(ver[1]);
                    }
                }
                
                // Sort to find the newest (higher year/version first)
                if (versions.length === 0) return null;
                return [...new Set(versions)].sort((a, b) => {
                    const aParts = a.split('.').map(Number);
                    const bParts = b.split('.').map(Number);
                    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
                        const diff = (bParts[i] || 0) - (aParts[i] || 0);
                        if (diff !== 0) return diff;
                    }
                    return 0;
                })[0];
            });
        }
    },
    {
        name: 'CockroachDB',
        releaseUrl: 'https://www.cockroachlabs.com/docs/releases/',
        extractVersion: async (page) => {
            return await page.evaluate(() => {
                const versions = [];
                
                // Look for version in links and text
                const links = document.querySelectorAll('a[href*="/releases/v"]');
                for (const link of links) {
                    const href = link.getAttribute('href') || '';
                    const match = href.match(/releases\/v(\d+\.\d+(?:\.\d+)?)/);
                    if (match) {
                        versions.push(match[1]);
                    }
                }
                
                // Check page content
                const text = document.body.innerText || '';
                const textMatches = text.match(/CockroachDB\s+v?(\d+\.\d+(?:\.\d+)?)/gi);
                if (textMatches) {
                    for (const m of textMatches) {
                        const ver = m.match(/(\d+\.\d+(?:\.\d+)?)/);
                        if (ver) versions.push(ver[1]);
                    }
                }
                
                if (versions.length === 0) return null;
                return [...new Set(versions)].sort((a, b) => {
                    const aParts = a.split('.').map(Number);
                    const bParts = b.split('.').map(Number);
                    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
                        const diff = (bParts[i] || 0) - (aParts[i] || 0);
                        if (diff !== 0) return diff;
                    }
                    return 0;
                })[0];
            });
        }
    },
    {
        name: 'Cassandra',
        releaseUrl: 'https://cassandra.apache.org/_/download.html',
        extractVersion: async (page) => {
            return await page.evaluate(() => {
                const versions = [];
                
                // Look for version patterns in page content
                const text = document.body.innerText || '';
                const patterns = [
                    /Apache\s+Cassandra\s+(\d+\.\d+(?:\.\d+)?)/gi,
                    /Cassandra\s+(\d+\.\d+(?:\.\d+)?)/gi,
                    /version\s+(\d+\.\d+(?:\.\d+)?)/gi
                ];
                
                for (const pattern of patterns) {
                    let match;
                    while ((match = pattern.exec(text)) !== null) {
                        versions.push(match[1]);
                    }
                }
                
                // Check download links
                const links = document.querySelectorAll('a[href*="cassandra"]');
                for (const link of links) {
                    const href = link.getAttribute('href') || '';
                    const match = href.match(/cassandra[/-](\d+\.\d+(?:\.\d+)?)/i);
                    if (match) {
                        versions.push(match[1]);
                    }
                }
                
                if (versions.length === 0) return null;
                return [...new Set(versions)].sort((a, b) => {
                    const aParts = a.split('.').map(Number);
                    const bParts = b.split('.').map(Number);
                    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
                        const diff = (bParts[i] || 0) - (aParts[i] || 0);
                        if (diff !== 0) return diff;
                    }
                    return 0;
                })[0];
            });
        }
    }
];

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate() {
    const now = new Date();
    return now.toISOString().split('T')[0];
}

/**
 * Check if a specific version already exists for a database
 */
async function versionExists(name, version) {
    const query = `SELECT COUNT(*) as count FROM releases WHERE name = $1 AND version = $2`;
    
    try {
        const result = await pool.query(query, [name, version]);
        return parseInt(result.rows[0].count) > 0;
    } catch (error) {
        console.log(`Error checking version existence:`, error.message);
        return false;
    }
}

/**
 * Insert a new release into the database
 */
async function insertRelease(name, version, releaseUrl) {
    const today = getTodayDate();
    const query = `
        INSERT INTO releases (name, version, release_url, scraped_date)
        VALUES ($1, $2, $3, $4)
        RETURNING id
    `;
    
    try {
        const result = await pool.query(query, [name, version, releaseUrl, today]);
        console.log(`✅ Inserted new release: ${name} ${version} (id: ${result.rows[0].id})`);
        return result.rows[0].id;
    } catch (error) {
        if (error.code === '23505') {
            // Duplicate key - version already exists
            console.log(`   ℹ️  ${name} ${version} already exists (duplicate)`);
            return null;
        }
        console.error(`❌ Error inserting release ${name} ${version}:`, error.message);
        return null;
    }
}

/**
 * Create the releases table if it doesn't exist
 */
async function ensureTableExists() {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS releases (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            version VARCHAR(50) NOT NULL,
            release_url TEXT,
            scraped_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(name, version)
        )
    `;
    
    try {
        await pool.query(createTableQuery);
        console.log('✅ Releases table ready');
    } catch (error) {
        console.error('❌ Error creating releases table:', error.message);
        throw error;
    }
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
            console.log(`   ⚠️ Attempt ${attempt}/${maxRetries} failed: ${error.message}`);
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
 * Main scraping function
 */
async function scrapeReleases() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║     Database Release Scraper - LIVE from Websites        ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`\n🚀 Starting at: ${new Date().toISOString()}`);
    console.log(`📅 Today's date: ${getTodayDate()}`);
    
    // Ensure the releases table exists
    await ensureTableExists();
    
    // Launch Puppeteer browser
    const browser = await puppeteer.launch({
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
    
    const results = [];
    const errors = [];
    
    try {
        for (const db of databases) {
            console.log(`\n${'─'.repeat(50)}`);
            console.log(`📦 Scraping ${db.name}...`);
            console.log(`   URL: ${db.releaseUrl}`);
            
            const page = await browser.newPage();
            
            // Set user agent to avoid blocking
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            try {
                // Navigate to the live URL
                console.log(`   🌐 Fetching live page...`);
                await navigateWithRetry(page, db.releaseUrl);
                
                // Wait for content to load
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Extract version using the database-specific extractor
                const version = await db.extractVersion(page);
                
                if (version) {
                    console.log(`   📌 Found version: ${version}`);
                    
                    // Check if this version already exists
                    const exists = await versionExists(db.name, version);
                    
                    if (exists) {
                        console.log(`   ℹ️  Version ${version} already exists in database`);
                        results.push({ name: db.name, version, status: 'exists' });
                    } else {
                        // Insert the new release
                        const id = await insertRelease(db.name, version, db.releaseUrl);
                        if (id) {
                            results.push({ name: db.name, version, id, status: 'inserted' });
                        } else {
                            results.push({ name: db.name, version, status: 'duplicate' });
                        }
                    }
                } else {
                    console.log(`   ⚠️  Could not extract version from page`);
                    results.push({ name: db.name, status: 'no-version' });
                }
            } catch (error) {
                console.error(`   ❌ Error: ${error.message}`);
                errors.push({ name: db.name, error: error.message });
                results.push({ name: db.name, status: 'error', error: error.message });
            } finally {
                await page.close();
            }
        }
    } finally {
        await browser.close();
        console.log('\n✓ Browser closed');
    }
    
    // Print summary
    console.log('\n' + '═'.repeat(50));
    console.log('📊 SCRAPING SUMMARY');
    console.log('═'.repeat(50));
    
    const inserted = results.filter(r => r.status === 'inserted');
    const existing = results.filter(r => r.status === 'exists' || r.status === 'duplicate');
    const failed = results.filter(r => r.status === 'error' || r.status === 'no-version');
    
    console.log(`\n✅ New releases inserted: ${inserted.length}`);
    for (const r of inserted) {
        console.log(`   - ${r.name}: ${r.version}`);
    }
    
    console.log(`\nℹ️  Already existing: ${existing.length}`);
    for (const r of existing) {
        console.log(`   - ${r.name}: ${r.version}`);
    }
    
    if (failed.length > 0) {
        console.log(`\n⚠️  Failed/No version: ${failed.length}`);
        for (const r of failed) {
            console.log(`   - ${r.name}: ${r.error || 'Could not extract version'}`);
        }
    }
    
    // Close database connection
    await pool.end();
    console.log('\n✓ Database connection closed');
    console.log(`🏁 Completed at: ${new Date().toISOString()}`);
}

// Run the scraper
scrapeReleases().catch(error => {
    console.error('Fatal error:', error);
    pool.end();
    process.exit(1);
});
