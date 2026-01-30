// db/setup.js - COMPLETE VERSION
const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');

async function setupDatabase() {
  console.log('📁 Setting up PostgreSQL database...');
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
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
      )
    `);
    console.log('✓ users table created');
    
    // 2. Categories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ categories table created');
    
    // 3. Suppliers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
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
      )
    `);
    console.log('✓ suppliers table created');
    
    // 4. Products table - MOST IMPORTANT!
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        sku VARCHAR(50) UNIQUE NOT NULL,
        description TEXT,
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
        cost_price DECIMAL(10,2) NOT NULL,
        selling_price DECIMAL(10,2) NOT NULL,
        current_stock INTEGER DEFAULT 0,
        min_stock_level INTEGER DEFAULT 10,
        max_stock_level INTEGER DEFAULT 100,
        unit VARCHAR(20) DEFAULT 'pcs',
        image_url VARCHAR(500),
        status VARCHAR(20) CHECK (status IN ('active', 'discontinued', 'out_of_stock')) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ products table created');
    
    // 5. Sales table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id SERIAL PRIMARY KEY,
        invoice_number VARCHAR(50) UNIQUE NOT NULL,
        customer_name VARCHAR(100),
        customer_email VARCHAR(100),
        customer_phone VARCHAR(20),
        total_amount DECIMAL(10,2) NOT NULL,
        discount_amount DECIMAL(10,2) DEFAULT 0.00,
        tax_amount DECIMAL(10,2) DEFAULT 0.00,
        final_amount DECIMAL(10,2) NOT NULL,
        payment_method VARCHAR(20) CHECK (payment_method IN ('cash', 'card', 'online', 'credit')) DEFAULT 'cash',
        payment_status VARCHAR(20) CHECK (payment_status IN ('paid', 'pending', 'partial', 'refunded')) DEFAULT 'paid',
        status VARCHAR(20) CHECK (status IN ('completed', 'pending', 'cancelled', 'refunded')) DEFAULT 'completed',
        sold_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        amount_paid DECIMAL(10,2) DEFAULT 0.00,
        change_amount DECIMAL(10,2) DEFAULT 0.00
      )
    `);
    console.log('✓ sales table created');
    
    // 6. Sale Items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id SERIAL PRIMARY KEY,
        sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        total_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ sale_items table created');
    
    // 7. Stock Movements table
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        movement_type VARCHAR(20) CHECK (movement_type IN ('in', 'out', 'adjustment')) NOT NULL,
        quantity INTEGER NOT NULL,
        reference_type VARCHAR(20) CHECK (reference_type IN ('sale', 'purchase', 'adjustment', 'return')) NOT NULL,
        reference_id INTEGER,
        notes TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        previous_stock INTEGER DEFAULT 0,
        new_stock INTEGER DEFAULT 0
      )
    `);
    console.log('✓ stock_movements table created');
    
    // 8. Purchase Orders table
    await client.query(`
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id SERIAL PRIMARY KEY,
        order_number VARCHAR(50) UNIQUE NOT NULL,
        supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        total_amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(20) CHECK (status IN ('pending', 'ordered', 'received', 'cancelled')) DEFAULT 'pending',
        order_date DATE,
        expected_delivery DATE,
        received_date DATE,
        notes TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ purchase_orders table created');
    
    // 9. Purchase Order Items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS purchase_order_items (
        id SERIAL PRIMARY KEY,
        purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL,
        unit_cost DECIMAL(10,2) NOT NULL,
        total_cost DECIMAL(10,2) NOT NULL,
        received_quantity INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ purchase_order_items table created');
    
    // 10. Payment Transactions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id SERIAL PRIMARY KEY,
        sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) NOT NULL,
        payment_method VARCHAR(20) CHECK (payment_method IN ('cash', 'card', 'online', 'credit')) NOT NULL,
        processed_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ payment_transactions table created');
    
    // Create indexes
    console.log('📊 Creating indexes...');
    
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
      'CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id)',
      'CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON products(supplier_id)',
      'CREATE INDEX IF NOT EXISTS idx_products_status ON products(status)',
      'CREATE INDEX IF NOT EXISTS idx_products_current_stock ON products(current_stock)',
      'CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)',
      'CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id)',
      'CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id)',
      'CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status)',
      'CREATE INDEX IF NOT EXISTS idx_sales_payment_status ON sales(payment_status)',
      'CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id)',
      'CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_payment_transactions_sale_id ON payment_transactions(sale_id)'
    ];
    
    for (const indexSql of indexes) {
      try {
        await client.query(indexSql);
      } catch (error) {
        // Ignore index errors
      }
    }
    
    // Create triggers for updated_at
    try {
      await client.query(`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$ language 'plpgsql'
      `);
      
      await client.query(`
        CREATE TRIGGER update_users_updated_at 
        BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
      `);
      
      await client.query(`
        CREATE TRIGGER update_products_updated_at 
        BEFORE UPDATE ON products
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
      `);
      
      await client.query(`
        CREATE TRIGGER update_sales_updated_at 
        BEFORE UPDATE ON sales
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
      `);
    } catch (error) {
      console.log('Triggers already exist');
    }
    
    // Create admin user
    console.log('👤 Creating admin user...');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('Admin@123', salt);
    
    try {
      // Check if admin already exists
      const checkResult = await client.query(
        'SELECT id FROM users WHERE email = $1',
        ['admin@inventory.com']
      );
      
      if (checkResult.rows.length === 0) {
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
        console.log('✅ Admin user created');
      } else {
        console.log('✅ Admin user already exists');
      }
    } catch (error) {
      console.log('⚠ Admin user error:', error.message);
    }
    
    await client.query('COMMIT');
    
    console.log('🎉 Database setup completed successfully!');
    console.log('📋 Admin credentials:');
    console.log('   Email: admin@inventory.com');
    console.log('   Password: Admin@123');
    
    return true;
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Database setup failed:', error.message);
    console.error('Error code:', error.code);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { setupDatabase };
