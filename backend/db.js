const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'database', 'vclock.db');
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function ensureSeedData() {
  const admin = await get('SELECT id FROM users WHERE employee_code = ?', ['admin']);
  if (!admin) {
    const hash = await bcrypt.hash('1234', 10);
    await run(
      `INSERT INTO users (employee_code, full_name, password_hash, role, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      ['admin', 'System Admin', hash, 'admin', 1]
    );
  }

  const employee = await get('SELECT id FROM users WHERE employee_code = ?', ['1001']);
  if (!employee) {
    const hash = await bcrypt.hash('1234', 10);
    await run(
      `INSERT INTO users (employee_code, full_name, password_hash, role, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      ['1001', 'Demo Employee', hash, 'employee', 1]
    );
  }
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_code TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      record_type TEXT NOT NULL CHECK(record_type IN ('in', 'out')),
      work_day_type TEXT NOT NULL,
      note TEXT DEFAULT '',
      record_time TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      prevent_double_checkin INTEGER NOT NULL DEFAULT 1,
      prevent_checkout_without_checkin INTEGER NOT NULL DEFAULT 1,
      allow_multiple_sessions_per_day INTEGER NOT NULL DEFAULT 1
    )
  `);

  await run(`
    INSERT OR IGNORE INTO settings (id, prevent_double_checkin, prevent_checkout_without_checkin, allow_multiple_sessions_per_day)
    VALUES (1, 1, 1, 1)
  `);

  await ensureSeedData();
}

module.exports = {
  db,
  run,
  get,
  all,
  initDb,
};
