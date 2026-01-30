// scripts/reset-db.js
require('dotenv').config();
const { pool } = require('../config/database');

async function resetDatabase() {
  const connection = await pool.getConnection();
  
  try {
    console.log('⚠️  Resetting database...');
    
    // Drop all tables
    const [tables] = await connection.query('SHOW TABLES');
    
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    
    for (const table of tables) {
      const tableName = table[`Tables_in_${process.env.DB_NAME}`];
      console.log(`Dropping table: ${tableName}`);
      await connection.query(`DROP TABLE IF EXISTS ${tableName}`);
    }
    
    await connection.query('DROP VIEW IF EXISTS category_statistics');
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    
    console.log('✅ Database reset complete');
    console.log('Run "npm run setup-db" to recreate tables');
    
  } catch (error) {
    console.error('Error resetting database:', error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

resetDatabase();