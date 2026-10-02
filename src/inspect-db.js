require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function main() {
  const tables = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
  `);
  console.log('Tables:', tables.rows.map(r => r.table_name));

  for (const row of tables.rows) {
    const cols = await pool.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = $1
    `, [row.table_name]);
    console.log(`\n--- ${row.table_name} ---`);
    cols.rows.forEach(c => console.log(`${c.column_name}: ${c.data_type}`));
  }

  await pool.end();
}

main().catch(err => console.error(err));