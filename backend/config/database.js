import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test database connection
pool.on('connect', () => {
  console.log('✓ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Queries to suppress from logging (noise reduction)
const SILENT_QUERIES = [
  'CREATE TABLE IF NOT EXISTS',
  'SELECT COUNT(*)',
  'SELECT DISTINCT category',
  'SELECT id, type, title, message, data, is_read, created_at',
  'SELECT last_execution_date FROM script_executions',
];

// Query helper function
export const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    // Only log queries that are not in the silent list
    const isSilent = SILENT_QUERIES.some(pattern => text.includes(pattern));
    if (!isSilent) {
      console.log('📊 Query:', { 
        text: text.replace(/\s+/g, ' ').trim().substring(0, 100) + (text.length > 100 ? '...' : ''),
        duration: duration + 'ms',
        rows: res.rowCount 
      });
    }
    return res;
  } catch (error) {
    console.error('❌ Database query error:', error);
    throw error;
  }
};

export default pool;