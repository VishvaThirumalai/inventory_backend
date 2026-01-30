// db/setup.js
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');

async function setupDatabase() {
  try {
    console.log('📁 Setting up PostgreSQL database...');
    
    // Read PostgreSQL schema file
    const schemaPath = path.join(__dirname, 'schema-postgres.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    
    // Split into individual statements
    const sqlStatements = schemaSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`Found ${sqlStatements.length} SQL statements to execute`);
    
    const client = await pool.connect();
    
    try {
      for (let i = 0; i < sqlStatements.length; i++) {
        const statement = sqlStatements[i];
        if (statement) {
          try {
            await client.query(statement);
            console.log(`✓ Executed statement ${i + 1}`);
          } catch (error) {
            // Skip "already exists" errors
            if (error.code === '42P07' || error.code === '42710' || error.code === '23505') {
              console.log(`⚠  Skipped statement ${i + 1} (already exists)`);
            } else {
              console.error(`❌ Error executing statement ${i + 1}:`, error.message);
              console.error('Statement:', statement.substring(0, 100) + '...');
              // Don't throw, continue with other statements
            }
          }
        }
      }
      
      console.log('✅ Database tables created successfully!');
      
      // Seed admin user
      await seedAdminUser(client);
      
      console.log('🎉 Database setup completed!');
      return true;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    throw error;
  }
}

async function seedAdminUser(client) {
  try {
    // Hash password: Admin@123
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('Admin@123', salt);
    
    const result = await client.query(
      'SELECT id FROM users WHERE email = $1',
      ['admin@inventory.com']
    );
    
    if (result.rows.length === 0) {
      await client.query(`
        INSERT INTO users (name, email, password, role, phone, status)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        'System Administrator',
        'admin@inventory.com',
        hashedPassword,
        'admin',
        '+1234567890',
        'active'
      ]);
      
      console.log('✓ Created default admin user');
      console.log('   Email: admin@inventory.com');
      console.log('   Password: Admin@123');
    } else {
      console.log('✓ Admin user already exists');
    }
  } catch (error) {
    console.error('Error creating admin:', error.message);
  }
}

module.exports = { setupDatabase };