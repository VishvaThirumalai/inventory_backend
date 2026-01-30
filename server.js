// server.js - Updated for PostgreSQL
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL || 'http://localhost:3000'
    : 'https://inventory-ui-pv33.onrender.com',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Database connection check
const { testConnection } = require('./config/database');
testConnection().then(() => {
  console.log('✅ PostgreSQL Database ready');
});

// Import routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const saleRoutes = require('./routes/sales');
const supplierRoutes = require('./routes/suppliers');
const categoryRoutes = require('./routes/categories');
const dashboardRoutes = require('./routes/dashboard');

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Health check
app.get('/health', async (req, res) => {
  try {
    const { pool } = require('./config/database');
    await pool.query('SELECT 1');
    
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'inventory-api',
      environment: process.env.NODE_ENV || 'development',
      database: 'postgresql',
      connected: true
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Inventory Management System API (PostgreSQL)',
    version: '1.0.0',
    documentation: '/health',
    database: 'PostgreSQL',
    endpoints: {
      auth: '/api/auth',
      products: '/api/products',
      sales: '/api/sales',
      suppliers: '/api/suppliers',
      categories: '/api/categories',
      dashboard: '/api/dashboard'
    }
  });
});

// Setup endpoint (for initial deployment)
app.post('/api/setup', async (req, res) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-setup-key'] !== process.env.SETUP_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const { setupDatabase } = require('./database/setup');
    await setupDatabase();
    res.json({ success: true, message: 'Database setup completed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// server.js - Add this after middleware section
const { setupDatabase } = require('./db/setup');

// Auto-setup middleware (runs once on first request)
let dbSetupComplete = false;
app.use(async (req, res, next) => {
  if (!dbSetupComplete && req.method === 'GET' && req.path === '/health') {
    try {
      await setupDatabase();
      dbSetupComplete = true;
      console.log('✅ Database auto-setup completed');
    } catch (error) {
      console.error('Database setup error:', error.message);
    }
  }
  next();
});
// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode`);
  console.log(`📊 Port: ${PORT}`);
  console.log(`💾 Database: PostgreSQL`);
  console.log(`🔗 http://localhost:${PORT}`);
});
