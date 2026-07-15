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
  ...(isAzure && { ssl: { rejectUnauthorized: false } }),
});

module.exports = pool;
