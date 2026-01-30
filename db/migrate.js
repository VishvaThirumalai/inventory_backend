// database/migrate.js
const { Pool } = require('pg');
require('dotenv').config();

async function migrate() {
  console.log('🚀 Starting PostgreSQL migration...');
  
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'inventory_db',
    port: process.env.DB_PORT || 5432,
  });
  
  try {
    const client = await pool.connect();
    
    // Check if we need to migrate from MySQL structure
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log(`Found ${tablesResult.rows.length} tables`);
    
    if (tablesResult.rows.length === 0) {
      console.log('No existing tables found. Running fresh setup...');
      const { setupDatabase } = require('./setup');
      await setupDatabase();
    } else {
      console.log('Database already has tables. Migration not needed.');
    }
    
    client.release();
    console.log('✅ Migration completed');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  migrate();
}

module.exports = { migrate };