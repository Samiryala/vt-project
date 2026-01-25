// scrapeReleases.js
// Scraping agent for database release notes
// Scrapes LIVE from websites - no local HTML files needed
import puppeteer from 'puppeteer';
import { query } from '../config/database.js';

// Database configurations for LIVE scraping
const databases = [
    {
        name: 'MongoDB',
        releaseUrl: 'https://www.mongodb.com/docs/manual/release-notes/',
        extractVersion: async (page) => {
            return await page.evaluate(() => {
                const versions = [];
                
                const links = document.querySelectorAll('a[href*="/release-notes/"]');
                for (const link of links) {
                    const href = link.getAttribute('href') || '';
                    const match = href.match(/release-notes\/(\d+\.\d+)/);
                    if (match) {
                        versions.push(match[1]);
                    }
                }
                
                const text = document.body.innerText || '';
                const textMatch = text.match(/MongoDB\s+(\d+\.\d+)/gi);
                if (textMatch) {
                    for (const m of textMatch) {
                        const ver = m.match(/(\d+\.\d+)/);
                        if (ver) versions.push(ver[1]);
                    }
                }
                
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
                
                const allLinks = document.querySelectorAll('a[href*="neo4j-5-"], a[href*="neo4j-2025"], a[href*="neo4j-2024"]');
                for (const link of allLinks) {
                    const href = link.getAttribute('href') || '';
                    const match = href.match(/neo4j-([\d-]+)\/?$/);
                    if (match) {
                        return match[1].replace(/-/g, '.');
                    }
                }
                
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
                
                const links = document.querySelectorAll('a[href*="release-notes"]');
                for (const link of links) {
                    const href = link.getAttribute('href') || '';
                    const match = href.match(/rs-(\d+)-(\d+)(?:-(\d+))?/);
                    if (match) {
                        versions.push(`${match[1]}.${match[2]}${match[3] ? '.' + match[3] : ''}`);
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
        name: 'TiDB',
        releaseUrl: 'https://docs.pingcap.com/tidb/stable/release-notes/',
        extractVersion: async (page) => {
            return await page.evaluate(() => {
                const metaDesc = document.querySelector('meta[name="description"]');
                if (metaDesc) {
                    const content = metaDesc.getAttribute('content') || '';
                    const match = content.match(/(\d+\.\d+\.\d+(?:-\w+)?)/);
                    if (match) return match[1];
                }
                
                const title = document.title || '';
                const titleMatch = title.match(/TiDB\s+v?(\d+\.\d+\.\d+)/i);
                if (titleMatch) return titleMatch[1];
                
                const text = document.body.innerText || '';
                const match = text.match(/TiDB\s+v?(\d+\.\d+\.\d+)/i);
                if (match) return match[1];
                
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
                
                const links = document.querySelectorAll('a[href*="/releases/ybdb-releases/v"]');
                for (const link of links) {
                    const href = link.getAttribute('href') || '';
                    const match = href.match(/v(\d{4}\.\d+(?:\.\d+)?|\d+\.\d+(?:\.\d+)?)/);
                    if (match) {
                        versions.push(match[1]);
                    }
                }
                
                const text = document.body.innerText || '';
                const textMatches = text.match(/v(\d{4}\.\d+(?:\.\d+)?)/g);
                if (textMatches) {
                    for (const m of textMatches) {
                        const ver = m.match(/v(\d{4}\.\d+(?:\.\d+)?)/);
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
        name: 'CockroachDB',
        releaseUrl: 'https://www.cockroachlabs.com/docs/releases/',
        extractVersion: async (page) => {
            return await page.evaluate(() => {
                const versions = [];
                
                const links = document.querySelectorAll('a[href*="/releases/v"]');
                for (const link of links) {
                    const href = link.getAttribute('href') || '';
                    const match = href.match(/releases\/v(\d+\.\d+(?:\.\d+)?)/);
                    if (match) {
                        versions.push(match[1]);
                    }
                }
                
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
    try {
        const result = await query(
            'SELECT COUNT(*) as count FROM releases WHERE name = $1 AND version = $2',
            [name, version]
        );
        return parseInt(result.rows[0].count) > 0;
    } catch (error) {
        console.error(`Error checking version existence:`, error.message);
        return false;
    }
}

/**
 * Insert a new release into the database
 */
async function insertRelease(name, version, releaseUrl) {
    const today = getTodayDate();
    
    try {
        const result = await query(
            `INSERT INTO releases (name, version, release_url, scraped_date)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [name, version, releaseUrl, today]
        );
        console.log(`✅ Inserted new release: ${name} ${version} (id: ${result.rows[0].id})`);
        return result.rows[0].id;
    } catch (error) {
        if (error.code === '23505') {
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
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS releases (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                version VARCHAR(50) NOT NULL,
                release_url TEXT,
                scraped_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(name, version)
            )
        `);
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
            await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
    }
    return false;
}

/**
 * Main scraping function - exported for use by service
 */
export async function scrapeReleases() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║     Database Release Scraper - LIVE from Websites        ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`\n🚀 Starting at: ${new Date().toISOString()}`);
    console.log(`📅 Today's date: ${getTodayDate()}`);
    
    await ensureTableExists();
    
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
    
    try {
        for (const db of databases) {
            console.log(`\n${'─'.repeat(50)}`);
            console.log(`📦 Scraping ${db.name}...`);
            console.log(`   URL: ${db.releaseUrl}`);
            
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            try {
                console.log(`   🌐 Fetching live page...`);
                await navigateWithRetry(page, db.releaseUrl);
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const version = await db.extractVersion(page);
                
                if (version) {
                    console.log(`   📌 Found version: ${version}`);
                    
                    const exists = await versionExists(db.name, version);
                    
                    if (exists) {
                        console.log(`   ℹ️  Version ${version} already exists in database`);
                        results.push({ name: db.name, version, status: 'exists' });
                    } else {
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
                results.push({ name: db.name, status: 'error', error: error.message });
            } finally {
                await page.close();
            }
        }
    } finally {
        await browser.close();
        console.log('\n✓ Browser closed');
    }
    
    // Summary
    const inserted = results.filter(r => r.status === 'inserted');
    const existing = results.filter(r => r.status === 'exists' || r.status === 'duplicate');
    const failed = results.filter(r => r.status === 'error' || r.status === 'no-version');
    
    console.log('\n' + '═'.repeat(50));
    console.log('📊 SCRAPING SUMMARY');
    console.log('═'.repeat(50));
    console.log(`✅ New releases inserted: ${inserted.length}`);
    console.log(`ℹ️  Already existing: ${existing.length}`);
    console.log(`⚠️  Failed/No version: ${failed.length}`);
    console.log(`🏁 Completed at: ${new Date().toISOString()}`);
    
    return {
        success: true,
        results,
        summary: {
            inserted: inserted.length,
            existing: existing.length,
            failed: failed.length,
            total: results.length
        }
    };
}

// Allow running directly from command line
const isMainModule = process.argv[1]?.includes('scrapeReleases');
if (isMainModule) {
    scrapeReleases()
        .then(result => {
            console.log('\nFinal result:', JSON.stringify(result.summary, null, 2));
            process.exit(0);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}
