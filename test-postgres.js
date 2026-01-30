// test-postgres.js
require('dotenv').config();
const { pool } = require('./config/database');
const Product = require('./models/Product');
const Supplier = require('./models/Supplier');

async function testPostgreSQL() {
  try {
    console.log('Testing PostgreSQL connection...');
    
    // Test connection
    const result = await pool.query('SELECT NOW() as time');
    console.log('✅ PostgreSQL time:', result.rows[0].time);
    
    // Test Product model
    const products = await Product.getAll({ page: 1, limit: 5 });
    console.log('✅ Products found:', products.total);
    
    // Test Supplier model
    const suppliers = await Supplier.getAll();
    console.log('✅ Suppliers found:', suppliers.length);
    
    console.log('✅ All PostgreSQL tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testPostgreSQL();