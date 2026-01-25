import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { Pool } = pg;

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'articales-db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '3afsawa7do5ra#oui123',
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