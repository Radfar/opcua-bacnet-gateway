const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

let tagIdCache = {};

async function loadTagCache() {
  const res = await pool.query('SELECT id, tag_name FROM tags');
  tagIdCache = {};
  for (const row of res.rows) tagIdCache[row.tag_name] = row.id;
}

// Creates the tag row if it doesn't exist yet, otherwise reuses it.
// Needed once for Z03_FAULT / Z03_AUTO, which weren't in the original seed data.
async function ensureTag(tagName, equipmentId, description, dataType, unit = null) {
  if (tagIdCache[tagName]) return tagIdCache[tagName];

  const existing = await pool.query('SELECT id FROM tags WHERE tag_name = $1', [tagName]);
  if (existing.rows.length > 0) {
    tagIdCache[tagName] = existing.rows[0].id;
    return existing.rows[0].id;
  }

  const inserted = await pool.query(
    `INSERT INTO tags (equipment_id, tag_name, description, data_type, unit)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [equipmentId, tagName, description, dataType, unit]
  );
  tagIdCache[tagName] = inserted.rows[0].id;
  return inserted.rows[0].id;
}

async function logValue(tagName, value, quality = 'GOOD') {
  const tagId = tagIdCache[tagName];
  if (!tagId) {
    console.warn(`historian: no tag_id cached for ${tagName}, skipping`);
    return;
  }
  await pool.query(
    `INSERT INTO tag_values (tag_id, value, quality, timestamp) VALUES ($1, $2, $3, NOW())`,
    [tagId, value, quality]
  );
}
async function initHistorian() {
  await loadTagCache();
  await ensureTag('Z03_FAULT', 8, 'Zone 03 fault status', 'BOOLEAN');
  await ensureTag('Z03_AUTO', 8, 'Zone 03 automatic mode command', 'BOOLEAN');
  console.log('[Historian] Tag cache loaded, Z03_FAULT/Z03_AUTO ensured');
}

module.exports = { loadTagCache, ensureTag, logValue, initHistorian, pool };