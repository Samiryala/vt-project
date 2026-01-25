import app from './app.js';
import dotenv from 'dotenv';
import pool from './config/database.js';
import { triggerDailyScrapers } from './services/scraperService.js';

dotenv.config();

const PORT = process.env.PORT || 5000;

// Test database connection before starting server
const startServer = async () => {
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('✓ Database connection verified');

    // Start server FIRST so it can serve requests immediately
    app.listen(PORT, () => {
      console.log(`✓ Server running on port ${PORT}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`✓ Health check: http://localhost:${PORT}/health`);
    });

    // Trigger daily scrapers in BACKGROUND (non-blocking)
    console.log('📅 Starting daily scrapers in background...');
    triggerDailyScrapers()
      .then(() => {
        console.log('✓ Daily scrapers completed in background');
      })
      .catch((scraperError) => {
        console.error('⚠️ Daily scrapers error (non-fatal):', scraperError.message);
      });

  } catch (error) {
    console.error('✗ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  await pool.end();
  process.exit(0);
});

startServer();