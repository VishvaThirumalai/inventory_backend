const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  // Create new user
  static async create(userData) {
    const { name, email, password, role = 'staff', phone } = userData;
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    const [result] = await pool.query(
      `INSERT INTO users (name, email, password, role, phone) 
       VALUES (?, ?, ?, ?, ?)`,
      [name, email, hashedPassword, role, phone]
    );
    
    return this.findById(result.insertId);
  }

  // Find user by ID
  static async findById(id) {
    const [rows] = await pool.query(
      'SELECT id, name, email, role, phone, status, created_at FROM users WHERE id = ?',
      [id]
    );
    return rows[0];
  }

  // Find user by email
  static async findByEmail(email) {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    return rows[0];
  }

  // Check password
  static async checkPassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }

  // Update user
  static async update(id, userData) {
    const fields = [];
    const values = [];
    
    for (const [key, value] of Object.entries(userData)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    
    values.push(id);
    
    await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    
    return this.findById(id);
  }

  // FORGOT PASSWORD: Set reset token
  static async setResetToken(email, token) {
    const expires = new Date();
    expires.setHours(expires.getHours() + 1); // 1 hour expiry
    
    await pool.query(
      'UPDATE users SET reset_password_token = ?, reset_password_expires = ? WHERE email = ?',
      [token, expires, email]
    );
  }

  // FORGOT PASSWORD: Find by reset token
  static async findByResetToken(token) {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE reset_password_token = ? AND reset_password_expires > NOW()',
      [token]
    );
    return rows[0];
  }

  // FORGOT PASSWORD: Clear reset token
  static async clearResetToken(id) {
    await pool.query(
      'UPDATE users SET reset_password_token = NULL, reset_password_expires = NULL WHERE id = ?',
      [id]
    );
  }
}

module.exports = User;