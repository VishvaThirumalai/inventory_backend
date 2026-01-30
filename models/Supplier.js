// models/Supplier.js
const { pool } = require('../config/database');

class Supplier {
  static async getAll() {
    const result = await pool.query('SELECT * FROM suppliers ORDER BY name');
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query('SELECT * FROM suppliers WHERE id = $1', [id]);
    return result.rows[0];
  }

  static async create(data) {
    const result = await pool.query(
      `INSERT INTO suppliers 
       (name, email, phone, address, contact_person, status) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        data.name, 
        data.email || null, 
        data.phone || null, 
        data.address || null, 
        data.contact_person || null, 
        data.status || 'active'
      ]
    );
    return result.rows[0];
  }

  static async update(id, data) {
    const allowedFields = ['name', 'email', 'phone', 'address', 'contact_person', 'status', 'rating', 'total_orders', 'on_time_delivery_rate'];
    const fields = [];
    const values = [];
    let paramCount = 1;
    
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && allowedFields.includes(key)) {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }
    
    if (fields.length === 0) {
      return this.findById(id);
    }
    
    values.push(id);
    
    await pool.query(
      `UPDATE suppliers SET ${fields.join(', ')} WHERE id = $${paramCount}`,
      values
    );
    
    return this.findById(id);
  }

  static async delete(id) {
    const result = await pool.query('DELETE FROM suppliers WHERE id = $1', [id]);
    return result.rowCount > 0;
  }

  // Get suppliers with product counts and categories
  static async getAllWithStats() {
    const result = await pool.query(`
      SELECT 
        s.*,
        COALESCE(p.product_count, 0) as product_count,
        COALESCE(p.total_stock_value, 0) as total_stock_value,
        STRING_AGG(DISTINCT c.name, ', ') as categories
      FROM suppliers s
      LEFT JOIN (
        SELECT 
          supplier_id,
          COUNT(*) as product_count,
          SUM(current_stock * cost_price) as total_stock_value
        FROM products 
        WHERE status != 'discontinued' AND supplier_id IS NOT NULL
        GROUP BY supplier_id
      ) p ON s.id = p.supplier_id
      LEFT JOIN products pr ON s.id = pr.supplier_id
      LEFT JOIN categories c ON pr.category_id = c.id
      GROUP BY s.id
      ORDER BY s.name
    `);
    return result.rows;
  }

  // Get categories supplied by this supplier
  static async getSupplierCategories(supplierId) {
    const result = await pool.query(`
      SELECT DISTINCT c.*
      FROM categories c
      INNER JOIN products p ON c.id = p.category_id
      WHERE p.supplier_id = $1 AND p.status != 'discontinued'
      ORDER BY c.name
    `, [supplierId]);
    return result.rows;
  }

  // Get performance metrics
  static async getPerformanceMetrics(supplierId) {
    const result = await pool.query(`
      SELECT 
        COUNT(DISTINCT po.id) as total_orders,
        COUNT(CASE WHEN po.status = 'received' THEN 1 END) as completed_orders,
        AVG(po.total_amount) as avg_order_value,
        MAX(po.order_date) as last_order_date
      FROM purchase_orders po
      WHERE po.supplier_id = $1
    `, [supplierId]);
    
    return result.rows[0] || {
      total_orders: 0,
      completed_orders: 0,
      avg_order_value: 0,
      last_order_date: null
    };
  }
}

module.exports = Supplier;