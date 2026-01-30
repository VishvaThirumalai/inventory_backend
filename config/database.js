// config/database.js - Use your external database URL
const { Pool } = require('pg');
require('dotenv').config();

console.log('🔧 Database Configuration:');
console.log('Using DATABASE_URL:', process.env.DATABASE_URL ? 'Yes' : 'No');
console.log('DB_HOST:', process.env.DB_HOST || 'Not set');
console.log('DB_NAME:', process.env.DB_NAME || 'Not set');

// Use external database URL (the one Render gave you)
const connectionString = process.env.DATABASE_URL || 
  `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

console.log('🔗 Connection string:', connectionString ? 'Set' : 'Not set');

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false // Required for Render PostgreSQL
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Event listeners
pool.on('connect', () => {
  console.log('✅ New PostgreSQL client connected');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL pool error:', err.message);
});

const testConnection = async () => {
  try {
    console.log('🔗 Testing PostgreSQL connection...');
    const client = await pool.connect();
    const result = await client.query('SELECT version()');
    console.log('✅ PostgreSQL connected successfully');
    console.log('Version:', result.rows[0].version.split(',')[0]);
    
    // Check if users table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'users'
      ) as exists
    `);
    
    console.log('Users table exists:', tableCheck.rows[0].exists);
    
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection FAILED:');
    console.error('Error:', error.message);
    console.error('Code:', error.code);
    console.error('Detail:', error.detail);
    console.error('\n💡 Check:');
    console.error('1. Is database linked to service?');
    console.error('2. Are environment variables set?');
    console.error('3. Is DATABASE_URL correct?');
    return false;
  }
};

// Test on startup
setTimeout(() => {
  testConnection();
}, 1000);

module.exports = {
  pool,
  testConnection,
  query: (text, params) => pool.query(text, params)
};
