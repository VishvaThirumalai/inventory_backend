// db/setup.js
const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');

async function setupDatabase() {
  console.log('📁 Setting up PostgreSQL database...');
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Create tables
    const tables = [
      // Users table
      `CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) CHECK (role IN ('admin', 'manager', 'staff')) DEFAULT 'staff',
        phone VARCHAR(20),
        status VARCHAR(20) CHECK (status IN ('active', 'inactive')) DEFAULT 'active',
        reset_password_token VARCHAR(255),
        reset_password_expires TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Categories table
      `CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Suppliers table
      `CREATE TABLE IF NOT EXISTS suppliers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100),
        phone VARCHAR(20),
        address TEXT,
        contact_person VARCHAR(100),
        status VARCHAR(20) CHECK (status IN ('active', 'inactive')) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        rating DECIMAL(3,2) DEFAULT 5.00,
        total_orders INTEGER DEFAULT 0,
        on_time_delivery_rate DECIMAL(5,2) DEFAULT 100.00
      )`,
      
      // Create other tables similarly...
    ];
    
    for (const tableSql of tables) {
      try {
        await client.query(tableSql);
        console.log('✓ Table created/verified');
      } catch (error) {
        if (error.code === '42P07') { // Table already exists
          console.log('✓ Table already exists');
        } else {
          throw error;
        }
      }
    }
    
    // Create admin user
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('Admin@123', salt);
    
    await client.query(`
      INSERT INTO users (name, email, password, role, phone, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (email) DO NOTHING
    `, [
      'System Administrator',
      'admin@inventory.com',
      hashedPassword,
      'admin',
      '+1234567890',
      'active'
    ]);
    
    await client.query('COMMIT');
    console.log('✅ Database setup completed!');
    console.log('👤 Admin user: admin@inventory.com / Admin@123');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Database setup failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { setupDatabase };
