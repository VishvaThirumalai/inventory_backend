const { pool } = require('../config/database');

class Supplier {
  static async getAll() {
    const [rows] = await pool.query('SELECT * FROM suppliers ORDER BY name');
    return rows;
  }

  static async findById(id) {
    const [rows] = await pool.query('SELECT * FROM suppliers WHERE id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const [result] = await pool.query(
      `INSERT INTO suppliers 
       (name, email, phone, address, contact_person, status) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.name, 
        data.email || null, 
        data.phone || null, 
        data.address || null, 
        data.contact_person || null, 
        data.status || 'active'
      ]
    );
    return this.findById(result.insertId);
  }

  static async update(id, data) {
    const allowedFields = ['name', 'email', 'phone', 'address', 'contact_person', 'status', 'rating', 'total_orders', 'on_time_delivery_rate'];
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
      `UPDATE suppliers SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await pool.query('DELETE FROM suppliers WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  // Get suppliers with product counts and categories
  static async getAllWithStats() {
    const [rows] = await pool.query(`
      SELECT 
        s.*,
        COALESCE(p.product_count, 0) as product_count,
        COALESCE(p.total_stock_value, 0) as total_stock_value,
        GROUP_CONCAT(DISTINCT c.name) as categories
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
    return rows;
  }

  // Get categories supplied by this supplier
  static async getSupplierCategories(supplierId) {
    const [rows] = await pool.query(`
      SELECT DISTINCT c.*
      FROM categories c
      INNER JOIN products p ON c.id = p.category_id
      WHERE p.supplier_id = ? AND p.status != 'discontinued'
      ORDER BY c.name
    `, [supplierId]);
    return rows;
  }

  // Get performance metrics
  static async getPerformanceMetrics(supplierId) {
    const [rows] = await pool.query(`
      SELECT 
        COUNT(DISTINCT po.id) as total_orders,
        COUNT(CASE WHEN po.status = 'received' THEN 1 END) as completed_orders,
        AVG(po.total_amount) as avg_order_value,
        MAX(po.order_date) as last_order_date
      FROM purchase_orders po
      WHERE po.supplier_id = ?
    `, [supplierId]);
    
    return rows[0] || {
      total_orders: 0,
      completed_orders: 0,
      avg_order_value: 0,
      last_order_date: null
    };
  }
}

module.exports = Supplier;