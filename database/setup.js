require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');

async function setup() {
  // connect WITHOUT specifying a database first
  const conn = await mysql.createConnection({
    host:             process.env.DB_HOST     || 'localhost',
    user:             process.env.DB_USER     || 'root',
    password:         process.env.DB_PASSWORD || '',
    port:             process.env.DB_PORT     || 3306,
    multipleStatements: true,
  });

  console.log('Connected to MySQL.');

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await conn.query(sql);

  console.log('Schema executed successfully.');

  // verify
  await conn.query(`USE \`SOI-2026-0052-mizyana\``);
  const [tables] = await conn.query('SHOW TABLES');
  console.log('\nTables created:');
  tables.forEach(t => console.log(' -', Object.values(t)[0]));

  await conn.end();
}

setup().catch(err => {
  console.error('\nERROR:', err.message);
  process.exit(1);
});
