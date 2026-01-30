const { pool } = require('../config/database');

class Product {
  static async getAll({ page = 1, limit = 10, search = '', status = '', category_id = '', supplier_id = '' } = {}) {
  console.log('Product.getAll called with:', { page, limit, search, status, category_id, supplier_id });
  
  const offset = (page - 1) * limit;
    // Build the base query with CASE statement
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
    
    // Handle search
    if (search) {
      query += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    // Handle status filter - FIXED CASE STATEMENT
    if (status && status !== 'all') {
      if (status === 'out_of_stock' || status === 'low_stock' || status === 'in_stock') {
        // For stock-based status, use stock_status
        query += ' AND CASE WHEN p.current_stock = 0 THEN ? WHEN p.current_stock <= p.min_stock_level THEN ? ELSE ? END = ?';
        params.push('out_of_stock', 'low_stock', 'in_stock', status);
      } else {
        // For product status (active, discontinued)
        query += ' AND p.status = ?';
        params.push(status);
      }
    }
    
    // Handle category filter
    if (category_id) {
      query += ' AND p.category_id = ?';
      params.push(category_id);
    }
    
    // Handle supplier filter
    if (supplier_id) {
      query += ' AND p.supplier_id = ?';
      params.push(supplier_id);
    }
    
    // Add ordering and pagination
    query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    // Execute query
    const [rows] = await pool.query(query, params);
    
    // Get total count with same filters - FIXED
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM products p
      WHERE 1=1
    `;
    const countParams = [];
    
    if (search) {
      countQuery += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.description LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    if (status && status !== 'all') {
      if (status === 'out_of_stock' || status === 'low_stock' || status === 'in_stock') {
        countQuery += ' AND CASE WHEN p.current_stock = 0 THEN ? WHEN p.current_stock <= p.min_stock_level THEN ? ELSE ? END = ?';
        countParams.push('out_of_stock', 'low_stock', 'in_stock', status);
      } else {
        countQuery += ' AND p.status = ?';
        countParams.push(status);
      }
    }
    
    if (category_id) {
      countQuery += ' AND p.category_id = ?';
      countParams.push(category_id);
    }
    
    if (supplier_id) {
      countQuery += ' AND p.supplier_id = ?';
      countParams.push(supplier_id);
    }
    
    const [countResult] = await pool.query(countQuery, countParams);
    
    return {
      products: rows,
      total: countResult[0].total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(countResult[0].total / limit)
    };
  }

  static async findById(id) {
    const [rows] = await pool.query(
      `SELECT 
        p.*, 
        c.name as category_name, 
        s.name as supplier_name,
        s.email as supplier_email,
        s.phone as supplier_phone
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       WHERE p.id = ?`,
      [id]
    );
    return rows[0];
  }

  static async findBySku(sku, excludeId = null) {
    let query = 'SELECT * FROM products WHERE sku = ?';
    const params = [sku];
    
    if (excludeId) {
      query += ' AND id != ?';
      params.push(excludeId);
    }
    
    const [rows] = await pool.query(query, params);
    return rows[0];
  }

  static async create(data) {
    // Auto-calculate status based on stock
    let status = data.status || 'active';
    const currentStock = parseInt(data.current_stock) || 0;
    
    if (currentStock === 0) {
      status = 'out_of_stock';
    }
    
    const [result] = await pool.query(
      `INSERT INTO products (
        name, sku, description, category_id, supplier_id, 
        cost_price, selling_price, current_stock, min_stock_level, 
        max_stock_level, unit, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    
    // Create stock movement record if initial stock > 0
    if (currentStock > 0) {
      await pool.query(
        `INSERT INTO stock_movements (
          product_id, movement_type, quantity, reference_type,
          notes, created_by, previous_stock, new_stock
        ) VALUES (?, 'in', ?, 'adjustment', ?, 1, 0, ?)`,
        [
          result.insertId,
          currentStock,
          'Initial stock',
          currentStock
        ]
      );
    }
    
    return this.findById(result.insertId);
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
    
    const allowedFields = [
      'name', 'sku', 'description', 'category_id', 'supplier_id',
      'cost_price', 'selling_price', 'current_stock', 'min_stock_level',
      'max_stock_level', 'unit', 'status'
    ];
    
    // Build update query
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        
        if (field === 'cost_price' || field === 'selling_price') {
          values.push(parseFloat(data[field]) || 0);
        } else if (field === 'current_stock' || field === 'min_stock_level' || field === 'max_stock_level') {
          values.push(parseInt(data[field]) || 0);
        } else if (field === 'status') {
          values.push(newStatus);
        } else {
          values.push(data[field]);
        }
      }
    }
    
    // Always update status if stock changed
    if (data.current_stock !== undefined && !data.status) {
      fields.push('status = ?');
      values.push(newStatus);
    }
    
    if (fields.length === 0) {
      return this.findById(id);
    }
    
    values.push(id);
    
    await pool.query(
      `UPDATE products SET ${fields.join(', ')} WHERE id = ?`,
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
          ) VALUES (?, ?, ?, 'adjustment', ?, 1, ?, ?)`,
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
      `UPDATE products SET status = 'discontinued' WHERE id = ?`,
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
      `UPDATE products SET current_stock = ?, status = ? WHERE id = ?`,
      [newStock, newStatus, productId]
    );
    
    // Record stock movement
    await pool.query(
      `INSERT INTO stock_movements (
        product_id, movement_type, quantity, reference_type,
        notes, created_by, previous_stock, new_stock
      ) VALUES (?, ?, ?, 'adjustment', ?, 1, ?, ?)`,
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
    const [rows] = await pool.query(
      `SELECT p.*, c.name as category_name, s.name as supplier_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       WHERE p.current_stock <= p.min_stock_level 
       AND p.status = 'active'
       ORDER BY (p.current_stock / NULLIF(p.min_stock_level, 0)) ASC`
    );
    return rows;
  }

  // Get products by category with pagination
  static async getByCategory(categoryId, { page = 1, limit = 10 } = {}) {
    const offset = (page - 1) * limit;
    
    const [rows] = await pool.query(
      `SELECT p.*, s.name as supplier_name
       FROM products p
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       WHERE p.category_id = ? AND p.status != 'discontinued'
       ORDER BY p.name
       LIMIT ? OFFSET ?`,
      [categoryId, parseInt(limit), parseInt(offset)]
    );
    
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM products 
       WHERE category_id = ? AND status != 'discontinued'`,
      [categoryId]
    );
    
    return {
      products: rows,
      total: countResult[0].total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(countResult[0].total / limit)
    };
  }

  // Get products by supplier with pagination
  static async getBySupplier(supplierId, { page = 1, limit = 10 } = {}) {
    const offset = (page - 1) * limit;
    
    const [rows] = await pool.query(
      `SELECT p.*, c.name as category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.supplier_id = ? AND p.status != 'discontinued'
       ORDER BY p.name
       LIMIT ? OFFSET ?`,
      [supplierId, parseInt(limit), parseInt(offset)]
    );
    
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM products 
       WHERE supplier_id = ? AND status != 'discontinued'`,
      [supplierId]
    );
    
    return {
      products: rows,
      total: countResult[0].total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(countResult[0].total / limit)
    };
  }
}

module.exports = Product;