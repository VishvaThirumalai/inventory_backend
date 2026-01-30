// database/setup.js
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');

async function setupDatabase() {
  try {
    console.log('📁 Setting up database...');
    
    // Read schema.sql file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    
    // Split into individual statements
    const sqlStatements = schemaSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`Found ${sqlStatements.length} SQL statements to execute`);
    
    // Execute each statement
    const connection = await pool.getConnection();
    
    try {
      for (let i = 0; i < sqlStatements.length; i++) {
        const statement = sqlStatements[i];
        try {
          await connection.query(statement);
          console.log(`✓ Executed statement ${i + 1}`);
        } catch (error) {
          // Skip "table already exists" errors
          if (error.code === 'ER_TABLE_EXISTS_ERROR' || 
              error.code === 'ER_DUP_KEYNAME') {
            console.log(`⚠  Skipped statement ${i + 1} (already exists)`);
          } else {
            console.error(`❌ Error executing statement ${i + 1}:`, error.message);
            console.error('Statement:', statement.substring(0, 100) + '...');
            throw error;
          }
        }
      }
      
      console.log('✅ Database tables created successfully!');
      
      // Seed admin user
      await seedAdminUser(connection);
      
      // Create category_statistics view
      await createCategoryStatisticsView(connection);
      
      console.log('🎉 Database setup completed!');
      return true;
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    throw error;
  }
}

async function seedAdminUser(connection) {
  try {
    // Hash password: Admin@123
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('Admin@123', salt);
    
    const [existing] = await connection.query(
      'SELECT id FROM users WHERE email = ?',
      ['admin@inventory.com']
    );
    
    if (existing.length === 0) {
      await connection.query(`
        INSERT INTO users (name, email, password, role, phone, status)
        VALUES (?, ?, ?, ?, ?, ?)
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

async function createCategoryStatisticsView(connection) {
  try {
    await connection.query(`
      CREATE OR REPLACE VIEW category_statistics AS
      SELECT 
        c.id,
        c.name,
        c.description,
        COALESCE(COUNT(p.id), 0) AS product_count,
        COALESCE(SUM(p.current_stock), 0) AS total_stock,
        COALESCE(SUM(p.current_stock * p.cost_price), 0) AS inventory_value,
        COALESCE(SUM(CASE WHEN p.current_stock <= p.min_stock_level THEN 1 ELSE 0 END), 0) AS low_stock_count
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id AND p.status != 'discontinued'
      GROUP BY c.id, c.name, c.description
    `);
    console.log('✓ Created category_statistics view');
  } catch (error) {
    console.warn('⚠  Could not create category_statistics view:', error.message);
  }
}

module.exports = { setupDatabase };