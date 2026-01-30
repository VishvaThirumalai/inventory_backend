// config/database.js
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'inventory_db',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});

// Test connection with auto-setup
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ MySQL Database connected successfully');
    
    // Check if tables exist
    const [tables] = await connection.query('SHOW TABLES LIKE "users"');
    
    if (tables.length === 0) {
      console.log('📦 No tables found. Running database setup...');
      const { setupDatabase } = require('../database/setup');
      await setupDatabase();
    } else {
      console.log('📊 Database tables already exist');
    }
    
    connection.release();
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    // Don't exit in production, just log
    if (process.env.NODE_ENV === 'development') {
      process.exit(1);
    }
  }
};

// Auto-setup on server start
if (process.env.NODE_ENV !== 'test') {
  testConnection();
}

module.exports = {
  pool,
  testConnection
};