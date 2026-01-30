// scripts/setup-db.js
require('dotenv').config();
const { setupDatabase } = require('../database/setup');

async function runSetup() {
  try {
    console.log('🚀 Starting database setup...');
    await setupDatabase();
    console.log('✅ Database setup completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  }
}

runSetup();