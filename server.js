// server.js - Complete with auto-setup
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// List of allowed origins
const allowedOrigins = [
  'http://localhost:3000',
  'https://inventory-ui-pv33.onrender.com',
  'https://inventory-api-m7d5.onrender.com',
  'https://inventory-management-system.onrender.com'
];

// CORS middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('🌍 CORS: Blocked origin -', origin);
      console.log('🌍 Allowed origins:', allowedOrigins);
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
}));

// Handle preflight requests
app.options('*', cors());

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Import database and setup
const { testConnection } = require('./config/database');
const { setupDatabase } = require('./db/setup');

// Global flag to track if setup ran
let isDatabaseInitialized = false;

// Initialize database on server start
async function initializeDatabase() {
  try {
    console.log('🔧 Checking database initialization...');
    
    // First test connection
    await testConnection();
    
    // Check if users table exists
    const { pool } = require('./config/database');
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      ) as exists
    `);
    
    if (!result.rows[0].exists) {
      console.log('📦 Database tables not found. Running setup...');
      await setupDatabase();
      isDatabaseInitialized = true;
      console.log('✅ Database initialization completed on server start');
    } else {
      isDatabaseInitialized = true;
      console.log('✅ Database already initialized');
    }
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    // Don't crash, we'll try again on first request
  }
}

// Start initialization (non-blocking)
initializeDatabase();

// Import routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const saleRoutes = require('./routes/sales');
const supplierRoutes = require('./routes/suppliers');
const categoryRoutes = require('./routes/categories');
const dashboardRoutes = require('./routes/dashboard');

// Middleware to check database on each request (only if not initialized)
app.use(async (req, res, next) => {
  if (!isDatabaseInitialized) {
    try {
      console.log('🔄 Database not initialized, running setup...');
      await setupDatabase();
      isDatabaseInitialized = true;
      console.log('✅ Database setup completed on first request');
    } catch (error) {
      console.error('❌ Database setup failed on request:', error.message);
    }
  }
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const { pool } = require('./config/database');
    
    // Test connection
    await pool.query('SELECT 1');
    
    // Check if users table exists
    const tablesResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      ) as users_table_exists
    `);
    
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'inventory-api',
      environment: process.env.NODE_ENV || 'development',
      database: 'postgresql',
      connected: true,
      tables_initialized: tablesResult.rows[0].users_table_exists,
      isDatabaseInitialized: isDatabaseInitialized
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      isDatabaseInitialized: isDatabaseInitialized
    });
  }
});

// Manual database setup endpoint
app.get('/api/setup-db', async (req, res) => {
  try {
    console.log('🔄 Manual database setup triggered...');
    await setupDatabase();
    isDatabaseInitialized = true;
    
    res.json({ 
      success: true, 
      message: 'Database setup completed successfully!',
      admin: {
        email: 'admin@inventory.com',
        password: 'Admin@123'
      }
    });
  } catch (error) {
    console.error('❌ Manual setup failed:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      error: error.code
    });
  }
});

// Test tables endpoint
app.get('/api/test-tables', async (req, res) => {
  try {
    const { pool } = require('./config/database');
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    res.json({
      success: true,
      tables: result.rows.map(row => row.table_name),
      count: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message,
      error: error.code 
    });
  }
});

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Inventory Management System API (PostgreSQL)',
    version: '1.0.0',
    status: 'running',
    database: 'PostgreSQL',
    isDatabaseInitialized: isDatabaseInitialized,
    endpoints: {
      auth: '/api/auth',
      products: '/api/products',
      sales: '/api/sales',
      suppliers: '/api/suppliers',
      categories: '/api/categories',
      dashboard: '/api/dashboard',
      health: '/health',
      setup: '/api/setup-db',
      testTables: '/api/test-tables'
    },
    adminCredentials: {
      email: 'admin@inventory.com',
      password: 'Admin@123'
    }
  });
});

// Clear database endpoint (use with caution)
app.post('/api/reset-db', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Reset not allowed in production' });
  }
  
  try {
    const { pool } = require('./config/database');
    const client = await pool.connect();
    
    // Drop all tables (in reverse order due to foreign keys)
    const tables = [
      'payment_transactions',
      'purchase_order_items',
      'purchase_orders',
      'stock_movements',
      'sale_items',
      'sales',
      'products',
      'suppliers',
      'categories',
      'users'
    ];
    
    await client.query('BEGIN');
    
    // Disable foreign key checks (PostgreSQL doesn't have this directly)
    for (const table of tables) {
      try {
        await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
        console.log(`Dropped table: ${table}`);
      } catch (error) {
        console.log(`Could not drop ${table}:`, error.message);
      }
    }
    
    await client.query('COMMIT');
    client.release();
    
    isDatabaseInitialized = false;
    
    res.json({ 
      success: true, 
      message: 'Database reset. Visit /api/setup-db to recreate tables.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: req.path,
    method: req.method,
    availableEndpoints: [
      '/',
      '/health',
      '/api/auth/*',
      '/api/products/*',
      '/api/sales/*',
      '/api/suppliers/*',
      '/api/categories/*',
      '/api/dashboard/*',
      '/api/setup-db',
      '/api/test-tables'
    ]
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('💥 Server error:', err.message);
  
  // Handle CORS errors
  if (err.message.includes('CORS')) {
    return res.status(403).json({
      success: false,
      message: 'CORS error: Request blocked. Check allowed origins.',
      allowedOrigins: allowedOrigins
    });
  }
  
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode`);
  console.log(`📊 Port: ${PORT}`);
  console.log(`💾 Database: PostgreSQL`);
  console.log(`🌍 Allowed origins:`, allowedOrigins);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 Setup DB: http://localhost:${PORT}/api/setup-db`);
  console.log(`🔗 Test tables: http://localhost:${PORT}/api/test-tables`);
});
