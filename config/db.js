const mysql = require('mysql2/promise');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const isAzure = (process.env.DB_HOST || '').includes('azure.com');

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'SOI-2026-2610-0035-mizyana',
  port:               process.env.DB_PORT     || 3306,
  waitForConnections: true,
  connectionLimit:    10,
  maxIdle:             10,
  idleTimeout:         60000,
  enableKeepAlive:     true,
  keepAliveInitialDelay: 0,
  timezone:           '+08:00',
  ...(isAzure && { ssl: { rejectUnauthorized: false } }),
});

pool.on('connection', connection => {
  connection.query("SET time_zone = '+08:00'", error => {
    if (error) {
      console.error('[db] Failed to set Singapore session timezone:', error.message);
    }
  });
});

module.exports = pool;
