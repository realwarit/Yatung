// =====================================================================
// MySQL helper สำหรับ function node (ทำ transaction ได้ — node `mysql` ทำไม่ได้)
// ใช้ผ่าน global.get('db'):
//   await db.query('SELECT ...', [params])                -> rows
//   await db.withTransaction(async (conn) => {            -> ผลลัพธ์ของ callback
//     const [rows] = await conn.query('SELECT ... FOR UPDATE', [id]);
//     await conn.query('UPDATE ...', [...]);              // throw = ROLLBACK, จบปกติ = COMMIT
//   })
// อ่านค่าเชื่อมต่อจาก env (DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME) ไม่ผ่าน credentials ของ node
// =====================================================================
const mysql = require('mysql2/promise');

let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      charset: 'utf8mb4_unicode_ci',
      timezone: '+07:00',
      dateStrings: true,        // DATE/DATETIME เป็น string ตรงๆ ไม่ผ่าน JS Date (กันเวลาเพี้ยน)
      decimalNumbers: true,     // DECIMAL เป็น number
      waitForConnections: true,
      connectionLimit: 10
    });
    pool.pool.on('connection', (c) => c.query("SET time_zone = '+07:00'"));
  }
  return pool;
}

async function query(sql, params) {
  const [rows] = await getPool().query(sql, params);
  return rows;
}

async function withTransaction(fn) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* connection อาจหลุดไปแล้ว */ }
    throw err;
  } finally {
    conn.release();
  }
}

async function close() {
  if (!pool) return;
  const p = pool;
  pool = null;
  await p.end();
}

// ปิด pool ตอน Node-RED shutdown (docker stop = SIGTERM)
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.once(sig, () => { close().catch(() => {}); });
}

module.exports = { query, withTransaction, close };
