// test-connection.js
require('dotenv').config();

// First, test environment variables
console.log('📋 Environment Variables Check:');
console.log('DB_HOST:', process.env.DB_HOST || 'localhost');
console.log('DB_PORT:', process.env.DB_PORT || '5432');
console.log('DB_USER:', process.env.DB_USER || 'postgres');
console.log('DB_NAME:', process.env.DB_NAME || 'inventory_db');
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');

// Test PostgreSQL connection directly
const { Pool } = require('pg');

async function testConnection() {
  try {
    console.log('\n🔗 Testing PostgreSQL connection...');
    
    const testPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'inventory_db',
      port: process.env.DB_PORT || 5432,
    });
    
    const client = await testPool.connect();
    console.log('✅ Connected to PostgreSQL');
    
    // Test a simple query
    const result = await client.query('SELECT version()');
    console.log('✅ PostgreSQL version:', result.rows[0].version.split(',')[0]);
    
    // Test SELECT 1
    const result2 = await client.query('SELECT 1 as test_value');
    console.log('✅ Simple query test:', result2.rows[0].test_value);
    
    // List databases
    const result3 = await client.query(`
      SELECT datname as database_name 
      FROM pg_database 
      WHERE datistemplate = false
    `);
    console.log('📊 Available databases:');
    result3.rows.forEach(row => console.log('  -', row.database_name));
    
    client.release();
    await testPool.end();
    
    console.log('\n🎉 All connection tests passed!');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Connection failed:', error.message);
    console.error('\n💡 Troubleshooting tips:');
    console.log('1. Is PostgreSQL running? (Check services)');
    console.log('2. Check credentials in .env file');
    console.log('3. Is port 5432 open?');
    console.log('4. Can you connect via pgAdmin or psql?');
    process.exit(1);
  }
}

testConnection();