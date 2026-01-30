const Category = require('../models/Category');
const { validationResult } = require('express-validator');

// Get all categories with product counts
exports.getAll = async (req, res) => {
  try {
    console.log('🔍 [Categories] Getting all categories with counts...');
    
    const { withCounts = 'true' } = req.query;
    
    let categories;
    if (withCounts === 'true') {
      categories = await Category.getAllWithProductCounts();
    } else {
      categories = await Category.getAll();
    }
    
    console.log(`✅ [Categories] Found ${categories.length} categories`);
    
    res.json({ 
      success: true, 
      data: categories,
      count: categories.length 
    });
  } catch (error) {
    console.error('❌ [Categories] Error in getAll:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch categories: ' + error.message,
      error: error.message
    });
  }
};

// Get category by ID with detailed info
exports.getById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    
    // Get product count
    const productCount = await Category.getProductCount(category.id);
    category.product_count = productCount;
    
    // Get suppliers for this category
    const suppliers = await Category.getCategorySuppliers(category.id);
    category.suppliers = suppliers;
    
    res.json({ success: true, data: category });
  } catch (error) {
    console.error('❌ [Categories] Error in getById:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create new category
exports.create = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const category = await Category.create(req.body);
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    console.error('❌ [Categories] Error in create:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update category
exports.update = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const category = await Category.update(req.params.id, req.body);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    
    res.json({ success: true, data: category });
  } catch (error) {
    console.error('❌ [Categories] Error in update:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete category
exports.delete = async (req, res) => {
  try {
    // Check if category has products
    const productCount = await Category.getProductCount(req.params.id);
    if (productCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete category with existing products. Move or delete products first.' 
      });
    }
    
    const deleted = await Category.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    console.error('❌ [Categories] Error in delete:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get category statistics
exports.getStats = async (req, res) => {
  try {
    const [stats] = await pool.query(`
      SELECT 
        COUNT(DISTINCT c.id) as total_categories,
        COUNT(DISTINCT p.id) as total_products,
        SUM(p.current_stock * p.cost_price) as total_inventory_value,
        SUM(CASE WHEN p.current_stock <= p.min_stock_level THEN 1 ELSE 0 END) as low_stock_products
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id
      WHERE p.status != 'discontinued' OR p.status IS NULL
    `);
    
    res.json({ success: true, data: stats[0] });
  } catch (error) {
    console.error('❌ [Categories] Error in getStats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};