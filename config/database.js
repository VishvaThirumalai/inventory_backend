// config/database.js
const { Pool } = require('pg');
require('dotenv').config();

console.log('🔧 Database Configuration:');

// Check if using DATABASE_URL (Render provides this)
let connectionConfig;
if (process.env.DATABASE_URL) {
  console.log('Using DATABASE_URL: Yes');
  connectionConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  };
} else {
  console.log('Using DATABASE_URL: No');
  console.log('DB_HOST:', process.env.DB_HOST || 'localhost');
  console.log('DB_NAME:', process.env.DB_NAME || 'inventory_db');
  
  connectionConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'inventory_db',
    port: process.env.DB_PORT || 5432,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  };
}

const pool = new Pool({
  ...connectionConfig,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Event listeners for debugging
pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('🔗 New PostgreSQL client connected');
  }
});

pool.on('error', (err) => {
  console.error('💥 PostgreSQL pool error:', err.message);
});

const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ PostgreSQL connected successfully');
    
    // Get PostgreSQL version
    const versionResult = await client.query('SELECT version()');
    console.log('Version:', versionResult.rows[0].version.split(',')[0]);
    
    // Check if users table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      ) as exists
    `);
    
    console.log('Users table exists:', tableCheck.rows[0].exists);
    
    client.release();
    return true;
  } catch (error) {
    console.error('❌ PostgreSQL connection failed:', error.message);
    console.error('Error code:', error.code);
    
    if (error.code === '28P01') {
      console.error('💡 Authentication failed. Check DB_PASSWORD.');
    } else if (error.code === '3D000') {
      console.error('💡 Database does not exist. Run setup first.');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('💡 Cannot connect. Is PostgreSQL running?');
    }
    
    return false;
  }
};

// Test connection on startup
if (process.env.NODE_ENV !== 'test') {
  setTimeout(() => {
    console.log('🔗 Testing PostgreSQL connection...');
    testConnection();
  }, 1000);
}

module.exports = {
  pool,
  testConnection,
  query: (text, params) => pool.query(text, params)
};
