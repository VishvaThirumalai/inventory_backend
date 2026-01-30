const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { testConnection } = require('./config/database');
// Import routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const saleRoutes = require('./routes/sales');
const supplierRoutes = require('./routes/suppliers');
const categoryRoutes = require('./routes/categories');
const dashboardRoutes = require('./routes/dashboard'); // Add this

const app = express();

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Test database connection
testConnection();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/dashboard', dashboardRoutes); // Add this

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'inventory-api',
    routes: [
      '/api/auth', 
      '/api/products', 
      '/api/sales', 
      '/api/suppliers', 
      '/api/categories', 
      '/api/dashboard',
      '/health'
    ]
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: req.path,
    method: req.method,
    availableRoutes: [
      '/api/auth/*',
      '/api/products/*',
      '/api/sales/*',
      '/api/suppliers/*',
      '/api/categories/*',
      '/api/dashboard/*'
    ]
  });
});
// In your main app.js or server.js, add this before your routes:
app.use((req, res, next) => {
  if (req.originalUrl.includes('/api/categories')) {
    console.log('🔄 [Middleware] Processing categories request:', {
      method: req.method,
      url: req.originalUrl,
      body: req.body,
      contentType: req.headers['content-type']
    });
  }
  next();
});
// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  console.error('Stack:', err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Database: MySQL (${process.env.DB_NAME})`);
  console.log(`🔗 http://localhost:${PORT}`);
  console.log(`✅ CORS enabled for: http://localhost:3000`);
  console.log('\n📋 Available routes:');
  console.log('   /api/auth/* - Authentication');
  console.log('   /api/products/* - Product management');
  console.log('   /api/sales/* - Sales management');
  console.log('   /api/suppliers/* - Supplier management');
  console.log('   /api/categories/* - Category management');
  console.log('   /api/dashboard/* - Dashboard data'); // Add this
  console.log('   /health - Health check');
});
testConnection().then(() => {
  console.log('✅ Database initialized and ready');
});