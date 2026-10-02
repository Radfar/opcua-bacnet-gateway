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
  const equipment = await pool.query('SELECT * FROM equipment');
  console.log('Equipment:', equipment.rows);

  const tags = await pool.query('SELECT * FROM tags');
  console.log('\nTags:', tags.rows);

  const recentValues = await pool.query('SELECT * FROM tag_values ORDER BY timestamp DESC LIMIT 5');
  console.log('\nMost recent tag_values:', recentValues.rows);

  await pool.end();
}

main().catch(err => console.error(err));