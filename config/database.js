// config/database.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 5432,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Test connection
const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ PostgreSQL Database connected successfully');
    
    // Check if users table exists
    const result = await client.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')"
    );
    
    if (!result.rows[0].exists) {
      console.log('📦 No tables found. Auto-creating database structure...');
      // Tables will be created on first API call
    } else {
      console.log('📊 Database tables already exist');
    }
    
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
};

// Auto-test connection
if (process.env.NODE_ENV !== 'test') {
  setTimeout(() => testConnection(), 1000);
}

module.exports = {
  pool,
  testConnection,
  query: (text, params) => pool.query(text, params)
};