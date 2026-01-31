const { pool } = require('../config/database');

class Category {
  // Get all categories with pagination and search
  static async getAll({ page = 1, limit = 20, search = '' } = {}) {
    const offset = (page - 1) * limit;
    let query = `
      SELECT c.id, c.name, c.description, c.created_at,
             (SELECT COUNT(*) FROM products WHERE category_id = c.id) as product_count
      FROM categories c
      WHERE 1=1
    `;
    const params = [];
    
    if (search) {
      query += ' AND (c.name ILIKE $' + (params.length + 1) + ' OR c.description ILIKE $' + (params.length + 1) + ')';
      params.push(`%${search}%`);
    }
    
    query += ' ORDER BY c.name ASC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(parseInt(limit), parseInt(offset));
    
    const { rows } = await pool.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM categories WHERE 1=1';
    const countParams = [];
    
    if (search) {
      countQuery += ' AND (name ILIKE $' + (countParams.length + 1) + ' OR description ILIKE $' + (countParams.length + 1) + ')';
      countParams.push(`%${search}%`);
    }
    
    const { rows: countResult } = await pool.query(countQuery, countParams);
    
    return {
      categories: rows,
      total: parseInt(countResult[0].total),
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(parseInt(countResult[0].total) / limit)
    };
  }

  // Get category by ID
  static async findById(id) {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.description, c.created_at
       FROM categories c
       WHERE c.id = $1`,
      [id]
    );
    
    return rows[0] || null;
  }


  // Create new category
  static async create(categoryData) {
    const { rows } = await pool.query(
      `INSERT INTO categories (name, description)
      VALUES ($1, $2)
      RETURNING *`,
      [categoryData.name, categoryData.description || null]
    );
    
    return rows[0];
  }

  // Update category
  static async update(id, categoryData) {
    const { rows } = await pool.query(
      `UPDATE categories 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description)
       WHERE id = $3
       RETURNING *`,
      [categoryData.name || null, categoryData.description || null, id]
    );
    
    return rows[0] || null;
  }

  // Delete category
  static async delete(id) {
    const { rows } = await pool.query(
      'DELETE FROM categories WHERE id = $1 RETURNING *',
      [id]
    );
    
    return rows[0];
  }

  // Get product count for category
  static async getProductCount(categoryId) {
    const { rows } = await pool.query(
      'SELECT COUNT(*) as count FROM products WHERE category_id = $1',
      [categoryId]
    );
    
    return parseInt(rows[0].count);
  }

  // Get category suppliers
  static async getCategorySuppliers(categoryId) {
    const { rows } = await pool.query(
      `SELECT DISTINCT s.* FROM suppliers s
       INNER JOIN products p ON s.id = p.supplier_id
       WHERE p.category_id = $1
       ORDER BY s.name`,
      [categoryId]
    );
    
    return rows;
  }

  // Get category statistics
  static async getStats() {
    const { rows } = await pool.query(`
      SELECT 
        COUNT(*) as total_categories,
        (SELECT COUNT(*) FROM products) as total_products
      FROM categories
    `);
    
    return rows[0];
  }
}

module.exports = Category;
