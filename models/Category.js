const { pool } = require('../config/database');

class Category {
  static async getAll() {
    const [rows] = await pool.query('SELECT * FROM categories ORDER BY name');
    return rows;
  }

  static async findById(id) {
    const [rows] = await pool.query('SELECT * FROM categories WHERE id = ?', [id]);
    return rows[0];
  }
  
static async create(data) {
  console.log('📝 [Category Model] Creating category with data:', {
    name: data.name,
    description: data.description,
    nameRaw: data.name,
    nameIncludesAmpersand: data.name?.includes('&'),
    nameIncludesAmpEntity: data.name?.includes('&amp;')
  });
  
  const [result] = await pool.query(
    `INSERT INTO categories (name, description) VALUES (?, ?)`,
    [data.name, data.description || null]
  );
  
  const insertedCategory = await this.findById(result.insertId);
  
  console.log('📝 [Category Model] Created category:', {
    id: insertedCategory.id,
    name: insertedCategory.name,
    nameFromDB: insertedCategory.name,
    nameIncludesAmpersand: insertedCategory.name?.includes('&'),
    nameIncludesAmpEntity: insertedCategory.name?.includes('&amp;')
  });
  
  return insertedCategory;
}

static async update(id, data) {
  console.log('📝 [Category Model] Updating category', id, 'with data:', {
    name: data.name,
    description: data.description,
    nameRaw: data.name,
    nameIncludesAmpersand: data.name?.includes('&'),
    nameIncludesAmpEntity: data.name?.includes('&amp;')
  });
  
  const allowedFields = ['name', 'description'];
  const fields = [];
  const values = [];
  
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && allowedFields.includes(key)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }
  
  if (fields.length === 0) {
    return this.findById(id);
  }
  
  values.push(id);
  
  await pool.query(
    `UPDATE categories SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
  
  const updatedCategory = await this.findById(id);
  
  console.log('📝 [Category Model] Updated category:', {
    id: updatedCategory.id,
    name: updatedCategory.name,
    nameFromDB: updatedCategory.name,
    nameIncludesAmpersand: updatedCategory.name?.includes('&'),
    nameIncludesAmpEntity: updatedCategory.name?.includes('&amp;')
  });
  
  return updatedCategory;
}

  static async delete(id) {
    const [result] = await pool.query('DELETE FROM categories WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  static async getProductCount(categoryId) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) as count FROM products 
       WHERE category_id = ? AND status != 'discontinued'`,
      [categoryId]
    );
    return rows[0].count || 0;
  }

  // New method: Get categories with product counts in one query
  static async getAllWithProductCounts() {
    const [rows] = await pool.query(`
      SELECT 
        c.*,
        COALESCE(p.product_count, 0) as product_count,
        COALESCE(p.total_stock_value, 0) as total_stock_value,
        COALESCE(p.low_stock_count, 0) as low_stock_count
      FROM categories c
      LEFT JOIN (
        SELECT 
          category_id,
          COUNT(*) as product_count,
          SUM(current_stock * cost_price) as total_stock_value,
          SUM(CASE WHEN current_stock <= min_stock_level THEN 1 ELSE 0 END) as low_stock_count
        FROM products 
        WHERE status != 'discontinued'
        GROUP BY category_id
      ) p ON c.id = p.category_id
      ORDER BY c.name
    `);
    return rows;
  }

  // Get suppliers for a specific category
  static async getCategorySuppliers(categoryId) {
    const [rows] = await pool.query(`
      SELECT DISTINCT s.*
      FROM suppliers s
      INNER JOIN products p ON s.id = p.supplier_id
      WHERE p.category_id = ? AND p.supplier_id IS NOT NULL
      ORDER BY s.name
    `, [categoryId]);
    return rows;
  }
}

module.exports = Category;