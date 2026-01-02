
import puppeteer from 'puppeteer';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

// Database configurations for scraping
const databases = [
    {
        name: 'MongoDB',
        htmlFile: 'mongodb_page1.html',
        releaseUrl: 'https://www.mongodb.com/docs/manual/release-notes/',
        extractVersion: async (page) => {
            // MongoDB versions are found in links like /release-notes/8.0/ or /release-notes/7.0/
            // Look for the MongoDB 8.0 mention in the menu/content
            const version = await page.evaluate(() => {
                // Try to find version from menu links or release notes mentions
                const links = document.querySelectorAll('a[href*="/release-notes/"]');
                const versions = [];
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
                return versions.length > 0 ? versions.sort((a, b) => {
                    const [aMajor, aMinor] = a.split('.').map(Number);
                    const [bMajor, bMinor] = b.split('.').map(Number);
                    return bMajor - aMajor || bMinor - aMinor;
                })[0] : null;
            });
            return version;
        }
    },
    {
        name: 'Neo4j',
        htmlFile: 'neoj4.html',
        releaseUrl: 'https://neo4j.com/release-notes/',
        extractVersion: async (page) => {
            // Neo4j has releases like "Neo4j 5.26.19" or "Neo4j 2025.11.2"
            const version = await page.evaluate(() => {
                // Look in the "Database" recent releases section
                const databaseSection = document.querySelector('.recent-releases');
                if (databaseSection) {
                    const links = databaseSection.querySelectorAll('a[href*="/database/neo4j-"]');
                    for (const link of links) {
                        const text = link.textContent.trim();
                        // Match "Neo4j 5.26.19" or "Neo4j 2025.11.2"
                        const match = text.match(/Neo4j\s+([\d.]+)/i);
                        if (match) {
                            return match[1];
                        }
                    }
                }
                // Fallback: search in the whole document
                const allLinks = document.querySelectorAll('a[href*="neo4j-5-"], a[href*="neo4j-2025"]');
                for (const link of allLinks) {
                    const href = link.getAttribute('href') || '';
                    // Extract version from URL like neo4j-5-26-19
                    const match = href.match(/neo4j-([\d-]+)\/?$/);
                    if (match) {
                        return match[1].replace(/-/g, '.');
                    }
                }
                return null;
            });
            return version;
        }
    },
    {
        name: 'Redis',
        htmlFile: 'redis_page1.html',
        releaseUrl: 'https://redis.io/docs/latest/operate/rs/release-notes/',
        extractVersion: async (page) => {
            // Redis Enterprise Software has release notes with versions like 8.0.x, 7.22.x
            const version = await page.evaluate(() => {
                // Look for version patterns in headings or links
                const text = document.body.innerText || '';
                
                // Match patterns like "8.0" or "7.22" in release notes context
                const patterns = [
                    /Redis\s+(?:Enterprise\s+)?(?:Software\s+)?(\d+\.\d+(?:\.\d+)?)/gi,
                    /version\s+(\d+\.\d+(?:\.\d+)?)/gi,
                    /v(\d+\.\d+(?:\.\d+)?)/gi
                ];
                
                const versions = [];
                for (const pattern of patterns) {
                    let match;
                    while ((match = pattern.exec(text)) !== null) {
                        versions.push(match[1]);
                    }
                }
                
                // Also check for links to specific version release notes
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
                return versions.sort((a, b) => {
                    const aParts = a.split('.').map(Number);
                    const bParts = b.split('.').map(Number);
                    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
                        const diff = (bParts[i] || 0) - (aParts[i] || 0);
                        if (diff !== 0) return diff;
                    }
                    return 0;
                })[0];
            });
            return version;
        }
    },
    {
        name: 'TiDB',
        htmlFile: 'tidb.html',
        releaseUrl: 'https://docs.pingcap.com/tidb/stable/release-notes/',
        extractVersion: async (page) => {
            // TiDB has versions in meta description: "8.5.0, 8.4.0-DMR, ..."
            const version = await page.evaluate(() => {
                // Check meta description
                const metaDesc = document.querySelector('meta[name="description"]');
                if (metaDesc) {
                    const content = metaDesc.getAttribute('content') || '';
                    // Match versions like 8.5.0, 8.4.0-DMR, etc.
                    const match = content.match(/(\d+\.\d+\.\d+(?:-\w+)?)/);
                    if (match) return match[1];
                }
                
                // Fallback: search in page content
                const text = document.body.innerText || '';
                const match = text.match(/TiDB\s+v?(\d+\.\d+\.\d+)/i);
                if (match) return match[1];
                
                return null;
            });
            return version;
        }
    },
    {
        name: 'YugabyteDB',
        htmlFile: 'yugabytedb.html',
        releaseUrl: 'https://docs.yugabyte.com/stable/releases/ybdb-releases/',
        extractVersion: async (page) => {
            // YugabyteDB has versions like v2025.2 (LTS), v2025.1 (STS)
            const version = await page.evaluate(() => {
                // Look for version links in the sidebar/navigation
                const links = document.querySelectorAll('a[href*="/releases/ybdb-releases/v"]');
                const versions = [];
                for (const link of links) {
                    const href = link.getAttribute('href') || '';
                    // Match v2025.2, v2024.2, v2.20, etc.
                    const match = href.match(/v(\d{4}\.\d+|\d+\.\d+)/);
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
                return versions.sort((a, b) => {
                    const aParts = a.split('.').map(Number);
                    const bParts = b.split('.').map(Number);
                    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
                        const diff = (bParts[i] || 0) - (aParts[i] || 0);
                        if (diff !== 0) return diff;
                    }
                    return 0;
                })[0];
            });
            return version;
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
 * Check if we have already scraped today
 */
async function hasScrapedToday() {
    const today = getTodayDate();
    const query = `SELECT COUNT(*) as count FROM releases WHERE scraped_date::date = $1`;
    
    try {
        const result = await pool.query(query, [today]);
        return parseInt(result.rows[0].count) > 0;
    } catch (error) {
        // Table might not exist or other error - proceed with scraping
        console.log('Could not check previous scrapes:', error.message);
        return false;
    }
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
 * Main scraping function
 */
async function scrapeReleases() {
    console.log('🚀 Starting database release scraper...');
    console.log(`📅 Today's date: ${getTodayDate()}`);
    
    // Ensure the releases table exists
    await ensureTableExists();
    
    // Check if we've already scraped today
    if (await hasScrapedToday()) {
        console.log('ℹ️  Already scraped today. Skipping to avoid duplicates.');
        console.log('   Run again tomorrow or delete today\'s entries to rescrape.');
        await pool.end();
        return;
    }
    
    // Launch Puppeteer browser
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const results = [];
    
    try {
        for (const db of databases) {
            console.log(`\n📦 Scraping ${db.name}...`);
            
            const htmlPath = path.join(__dirname, db.htmlFile);
            
            // Check if HTML file exists
            if (!fs.existsSync(htmlPath)) {
                console.log(`⚠️  HTML file not found: ${db.htmlFile}`);
                continue;
            }
            
            // Read HTML content
            const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
            
            // Create a new page and set the HTML content
            const page = await browser.newPage();
            await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
            
            try {
                // Extract version using the database-specific extractor
                const version = await db.extractVersion(page);
                
                if (version) {
                    console.log(`   Found version: ${version}`);
                    
                    // Check if this version already exists
                    const exists = await versionExists(db.name, version);
                    
                    if (exists) {
                        console.log(`   ℹ️  Version ${version} already exists in database`);
                    } else {
                        // Insert the new release
                        const id = await insertRelease(db.name, version, db.releaseUrl);
                        if (id) {
                            results.push({ name: db.name, version, id });
                        }
                    }
                } else {
                    console.log(`   ⚠️  Could not extract version`);
                }
            } catch (error) {
                console.error(`   ❌ Error extracting version:`, error.message);
            } finally {
                await page.close();
            }
        }
    } finally {
        await browser.close();
    }
    
    // Print summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 SCRAPING SUMMARY');
    console.log('='.repeat(50));
    
    if (results.length > 0) {
        console.log(`\n✅ New releases inserted: ${results.length}`);
        for (const r of results) {
            console.log(`   - ${r.name}: ${r.version}`);
        }
    } else {
        console.log('\nℹ️  No new releases found or all versions already exist.');
    }
    
    // Close database connection
    await pool.end();
    console.log('\n🏁 Scraping complete!');
}

// Run the scraper
scrapeReleases().catch(error => {
    console.error('Fatal error:', error);
    pool.end();
    process.exit(1);
});
