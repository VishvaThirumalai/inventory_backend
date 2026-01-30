// models/Product.js
const { pool } = require('../config/database');

class Product {
  static async getAll({ page = 1, limit = 10, search = '', status = '', category_id = '', supplier_id = '' } = {}) {
    console.log('Product.getAll called with:', { page, limit, search, status, category_id, supplier_id });
    
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        p.*, 
        c.name as category_name, 
        s.name as supplier_name,
        CASE 
          WHEN p.current_stock = 0 THEN 'out_of_stock'
          WHEN p.current_stock <= p.min_stock_level THEN 'low_stock'
          ELSE 'in_stock'
        END as stock_status
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    // Handle search
    if (search) {
      query += ` AND (p.name ILIKE $${paramCount} OR p.sku ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }
    
    // Handle status filter
    if (status && status !== 'all') {
      if (status === 'out_of_stock' || status === 'low_stock' || status === 'in_stock') {
        query += ` AND CASE WHEN p.current_stock = 0 THEN 'out_of_stock' WHEN p.current_stock <= p.min_stock_level THEN 'low_stock' ELSE 'in_stock' END = $${paramCount}`;
        params.push(status);
        paramCount++;
      } else {
        query += ` AND p.status = $${paramCount}`;
        params.push(status);
        paramCount++;
      }
    }
    
    // Handle category filter
    if (category_id) {
      query += ` AND p.category_id = $${paramCount}`;
      params.push(category_id);
      paramCount++;
    }
    
    // Handle supplier filter
    if (supplier_id) {
      query += ` AND p.supplier_id = $${paramCount}`;
      params.push(supplier_id);
      paramCount++;
    }
    
    // Add ordering and pagination
    query += ` ORDER BY p.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(parseInt(limit), parseInt(offset));
    
    // Execute query
    const result = await pool.query(query, params);
    
    // Get total count with same filters
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM products p
      WHERE 1=1
    `;
    const countParams = [];
    let countParamCount = 1;
    
    if (search) {
      countQuery += ` AND (p.name ILIKE $${countParamCount} OR p.sku ILIKE $${countParamCount} OR p.description ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
      countParamCount++;
    }
    
    if (status && status !== 'all') {
      if (status === 'out_of_stock' || status === 'low_stock' || status === 'in_stock') {
        countQuery += ` AND CASE WHEN p.current_stock = 0 THEN 'out_of_stock' WHEN p.current_stock <= p.min_stock_level THEN 'low_stock' ELSE 'in_stock' END = $${countParamCount}`;
        countParams.push(status);
        countParamCount++;
      } else {
        countQuery += ` AND p.status = $${countParamCount}`;
        countParams.push(status);
        countParamCount++;
      }
    }
    
    if (category_id) {
      countQuery += ` AND p.category_id = $${countParamCount}`;
      countParams.push(category_id);
      countParamCount++;
    }
    
    if (supplier_id) {
      countQuery += ` AND p.supplier_id = $${countParamCount}`;
      countParams.push(supplier_id);
      countParamCount++;
    }
    
    const countResult = await pool.query(countQuery, countParams);
    
    return {
      products: result.rows,
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
    };
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT 
        p.*, 
        c.name as category_name, 
        s.name as supplier_name,
        s.email as supplier_email,
        s.phone as supplier_phone
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       WHERE p.id = $1`,
      [id]
    );
    return result.rows[0];
  }

  static async findBySku(sku, excludeId = null) {
    let query = 'SELECT * FROM products WHERE sku = $1';
    const params = [sku];
    
    if (excludeId) {
      query += ' AND id != $2';
      params.push(excludeId);
    }
    
    const result = await pool.query(query, params);
    return result.rows[0];
  }

  static async create(data) {
    // Auto-calculate status based on stock
    let status = data.status || 'active';
    const currentStock = parseInt(data.current_stock) || 0;
    
    if (currentStock === 0) {
      status = 'out_of_stock';
    }
    
    const result = await pool.query(
      `INSERT INTO products (
        name, sku, description, category_id, supplier_id, 
        cost_price, selling_price, current_stock, min_stock_level, 
        max_stock_level, unit, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        data.name, 
        data.sku, 
        data.description || '', 
        data.category_id || null, 
        data.supplier_id || null,
        parseFloat(data.cost_price) || 0, 
        parseFloat(data.selling_price) || 0, 
        currentStock,
        parseInt(data.min_stock_level) || 10, 
        parseInt(data.max_stock_level) || 100,
        data.unit || 'pcs', 
        status
      ]
    );
    
    const newProduct = result.rows[0];
    
    // Create stock movement record if initial stock > 0
    if (currentStock > 0) {
      await pool.query(
        `INSERT INTO stock_movements (
          product_id, movement_type, quantity, reference_type,
          notes, created_by, previous_stock, new_stock
        ) VALUES ($1, 'in', $2, 'adjustment', $3, 1, 0, $4)`,
        [
          newProduct.id,
          currentStock,
          'Initial stock',
          currentStock
        ]
      );
    }
    
    return newProduct;
  }

  static async update(id, data) {
    // Get current product to compare stock
    const currentProduct = await this.findById(id);
    if (!currentProduct) {
      throw new Error('Product not found');
    }
    
    // Determine new status
    let newStatus = data.status || currentProduct.status;
    const newStock = parseInt(data.current_stock) || parseInt(currentProduct.current_stock);
    
    // Auto-update status based on stock
    if (newStock === 0) {
      newStatus = 'out_of_stock';
    } else if (data.status === 'active' && newStock > 0) {
      newStatus = 'active';
    }
    
    const fields = [];
    const values = [];
    let paramCount = 1;
    
    const allowedFields = [
      'name', 'sku', 'description', 'category_id', 'supplier_id',
      'cost_price', 'selling_price', 'current_stock', 'min_stock_level',
      'max_stock_level', 'unit', 'status'
    ];
    
    // Build update query
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        fields.push(`${field} = $${paramCount}`);
        
        if (field === 'cost_price' || field === 'selling_price') {
          values.push(parseFloat(data[field]) || 0);
        } else if (field === 'current_stock' || field === 'min_stock_level' || field === 'max_stock_level') {
          values.push(parseInt(data[field]) || 0);
        } else if (field === 'status') {
          values.push(newStatus);
        } else {
          values.push(data[field]);
        }
        paramCount++;
      }
    }
    
    // Always update status if stock changed
    if (data.current_stock !== undefined && !data.status) {
      fields.push('status = $' + paramCount);
      values.push(newStatus);
      paramCount++;
    }
    
    if (fields.length === 0) {
      return this.findById(id);
    }
    
    values.push(id);
    
    await pool.query(
      `UPDATE products SET ${fields.join(', ')} WHERE id = $${paramCount}`,
      values
    );
    
    // If stock changed, create movement record
    if (data.current_stock !== undefined) {
      const oldStock = parseInt(currentProduct.current_stock) || 0;
      const difference = newStock - oldStock;
      
      if (difference !== 0) {
        await pool.query(
          `INSERT INTO stock_movements (
            product_id, movement_type, quantity, reference_type,
            notes, created_by, previous_stock, new_stock
          ) VALUES ($1, $2, $3, 'adjustment', $4, 1, $5, $6)`,
          [
            id,
            difference > 0 ? 'in' : 'out',
            Math.abs(difference),
            'Manual stock adjustment',
            oldStock,
            newStock
          ]
        );
      }
    }
    
    return this.findById(id);
  }

  static async delete(id) {
    // Don't actually delete, just mark as discontinued
    await pool.query(
      `UPDATE products SET status = 'discontinued' WHERE id = $1`,
      [id]
    );
    return true;
  }

  static async updateStock(productId, quantity) {
    const product = await this.findById(productId);
    if (!product) throw new Error('Product not found');
    
    const oldStock = parseInt(product.current_stock) || 0;
    const newStock = oldStock + parseInt(quantity);
    
    // Determine new status
    let newStatus = product.status;
    if (newStock === 0) {
      newStatus = 'out_of_stock';
    } else if (newStock <= parseInt(product.min_stock_level)) {
      newStatus = 'active'; // Still active but low stock
    } else if (product.status === 'out_of_stock' && newStock > 0) {
      newStatus = 'active';
    }
    
    await pool.query(
      `UPDATE products SET current_stock = $1, status = $2 WHERE id = $3`,
      [newStock, newStatus, productId]
    );
    
    // Record stock movement
    await pool.query(
      `INSERT INTO stock_movements (
        product_id, movement_type, quantity, reference_type,
        notes, created_by, previous_stock, new_stock
      ) VALUES ($1, $2, $3, 'adjustment', $4, 1, $5, $6)`,
      [
        productId,
        parseInt(quantity) > 0 ? 'in' : 'out',
        Math.abs(parseInt(quantity)),
        'Manual stock update',
        oldStock,
        newStock
      ]
    );
    
    return this.findById(productId);
  }

  static async getLowStock() {
    const result = await pool.query(
      `SELECT p.*, c.name as category_name, s.name as supplier_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       WHERE p.current_stock <= p.min_stock_level 
       AND p.status = 'active'
       ORDER BY (p.current_stock / NULLIF(p.min_stock_level, 0)) ASC`
    );
    return result.rows;
  }

  // Get products by category with pagination
  static async getByCategory(categoryId, { page = 1, limit = 10 } = {}) {
    const offset = (page - 1) * limit;
    
    const result = await pool.query(
      `SELECT p.*, s.name as supplier_name
       FROM products p
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       WHERE p.category_id = $1 AND p.status != 'discontinued'
       ORDER BY p.name
       LIMIT $2 OFFSET $3`,
      [categoryId, parseInt(limit), parseInt(offset)]
    );
    
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM products 
       WHERE category_id = $1 AND status != 'discontinued'`,
      [categoryId]
    );
    
    return {
      products: result.rows,
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
    };
  }

  // Get products by supplier with pagination
  static async getBySupplier(supplierId, { page = 1, limit = 10 } = {}) {
    const offset = (page - 1) * limit;
    
    const result = await pool.query(
      `SELECT p.*, c.name as category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.supplier_id = $1 AND p.status != 'discontinued'
       ORDER BY p.name
       LIMIT $2 OFFSET $3`,
      [supplierId, parseInt(limit), parseInt(offset)]
    );
    
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM products 
       WHERE supplier_id = $1 AND status != 'discontinued'`,
      [supplierId]
    );
    
    return {
      products: result.rows,
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
    };
  }
}

module.exports = Product;