const session = require('express-session');
const pool = require('../config/db');

class MySqlSessionStore extends session.Store {
  constructor(options = {}) {
    super();
    this.tableName = options.tableName || 'user_session';
    this.ready = null;
  }

  async ensureTable() {
    if (!this.ready) {
      this.ready = pool.execute(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          session_id VARCHAR(128) PRIMARY KEY,
          expires_at DATETIME NOT NULL,
          data LONGTEXT NOT NULL,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_user_session_expires (expires_at)
        )
      `);
    }
    return this.ready;
  }

  getExpiry(sessionData) {
    if (sessionData && sessionData.cookie && sessionData.cookie.expires) {
      return new Date(sessionData.cookie.expires);
    }

    const maxAge = Number(sessionData && sessionData.cookie && sessionData.cookie.maxAge)
      || 1000 * 60 * 60 * 24;
    return new Date(Date.now() + maxAge);
  }

  async get(sessionId, callback) {
    try {
      await this.ensureTable();
      const [rows] = await pool.execute(
        `SELECT data FROM ${this.tableName} WHERE session_id = ? AND expires_at > NOW() LIMIT 1`,
        [sessionId]
      );

      if (!rows.length) return callback(null, null);
      callback(null, JSON.parse(rows[0].data));
    } catch (err) {
      callback(err);
    }
  }

  async set(sessionId, sessionData, callback = () => {}) {
    try {
      await this.ensureTable();
      await pool.execute(
        `INSERT INTO ${this.tableName} (session_id, expires_at, data)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at), data = VALUES(data)`,
        [sessionId, this.getExpiry(sessionData), JSON.stringify(sessionData)]
      );
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  async destroy(sessionId, callback = () => {}) {
    try {
      await this.ensureTable();
      await pool.execute(`DELETE FROM ${this.tableName} WHERE session_id = ?`, [sessionId]);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  async touch(sessionId, sessionData, callback = () => {}) {
    try {
      await this.ensureTable();
      await pool.execute(
        `UPDATE ${this.tableName} SET expires_at = ? WHERE session_id = ?`,
        [this.getExpiry(sessionData), sessionId]
      );
      callback(null);
    } catch (err) {
      callback(err);
    }
  }
}

module.exports = MySqlSessionStore;
