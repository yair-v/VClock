const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('Missing DATABASE_URL environment variable');
}

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

async function query(sql, params = []) {
  return pool.query(sql, params);
}

async function ensureSeedData() {
  const admin = await query(
    'SELECT id FROM users WHERE employee_code = $1',
    ['admin']
  );

  if (admin.rows.length === 0) {
    const hash = await bcrypt.hash('1234', 10);
    await query(
      `INSERT INTO users
       (employee_code, full_name, password_hash, role, is_active, day_closed, allowed_work_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['admin', 'System Admin', hash, 'admin', 1, 0, '[]']
    );
  }

  const employee = await query(
    'SELECT id FROM users WHERE employee_code = $1',
    ['1001']
  );

  if (employee.rows.length === 0) {
    const hash = await bcrypt.hash('1234', 10);
    await query(
      `INSERT INTO users
       (employee_code, full_name, password_hash, role, is_active, day_closed, allowed_work_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['1001', 'Demo Employee', hash, 'employee', 1, 0, '[]']
    );
  }

  await query(
    `INSERT INTO work_groups (name, description, work_days, is_active)
     VALUES
       ('ראשון-חמישי', 'קבוצת עבודה רגילה', '["ראשון","שני","שלישי","רביעי","חמישי"]', 1),
       ('ראשון-שישי', 'קבוצת עבודה מורחבת', '["ראשון","שני","שלישי","רביעי","חמישי","שישי"]', 1)
     ON CONFLICT (name) DO NOTHING`
  );

  await query(
    `UPDATE users
     SET work_group_id = wg.id
     FROM work_groups wg
     WHERE users.employee_code = '1001'
       AND users.role = 'employee'
       AND users.work_group_id IS NULL
       AND wg.name = 'ראשון-חמישי'`
  );
}

async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      employee_code TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',
      is_active INTEGER NOT NULL DEFAULT 1,
      day_closed INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS attendance_records (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      record_type TEXT NOT NULL CHECK (record_type IN ('in', 'out')),
      work_day_type TEXT NOT NULL,
      note TEXT DEFAULT '',
      latitude TEXT DEFAULT '',
      longitude TEXT DEFAULT '',
      location_status TEXT DEFAULT 'ok',
      ip_address TEXT DEFAULT '',
      device_info TEXT DEFAULT '',
      record_time TIMESTAMP NOT NULL DEFAULT NOW(),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY,
      prevent_double_checkin INTEGER NOT NULL DEFAULT 1,
      prevent_checkout_without_checkin INTEGER NOT NULL DEFAULT 1,
      allow_multiple_sessions_per_day INTEGER NOT NULL DEFAULT 1,
      work_day_types TEXT DEFAULT '["יום רגיל","שישי","שבת","חג","חופשה","מחלה","מילואים","עבודה מהבית","אחר"]'
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS work_groups (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT DEFAULT '',
      work_days TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS day_closed INTEGER NOT NULL DEFAULT 0
  `);

  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS allowed_work_days TEXT NOT NULL DEFAULT '[]'
  `);

  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS work_group_id INTEGER NULL
  `);

  await query(`
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS latitude TEXT DEFAULT ''
  `);

  await query(`
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS longitude TEXT DEFAULT ''
  `);

  await query(`
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS location_status TEXT DEFAULT 'ok'
  `);

  await query(`
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS ip_address TEXT DEFAULT ''
  `);

  await query(`
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS device_info TEXT DEFAULT ''
  `);

  await query(`
    ALTER TABLE settings
    ADD COLUMN IF NOT EXISTS work_day_types TEXT DEFAULT '["יום רגיל","שישי","שבת","חג","חופשה","מחלה","מילואים","עבודה מהבית","אחר"]'
  `);

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_work_group_fk'
      ) THEN
        ALTER TABLE users
        ADD CONSTRAINT users_work_group_fk
        FOREIGN KEY (work_group_id)
        REFERENCES work_groups(id)
        ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  await query(`
    INSERT INTO settings (
      id,
      prevent_double_checkin,
      prevent_checkout_without_checkin,
      allow_multiple_sessions_per_day,
      work_day_types
    )
    VALUES (
      1,
      1,
      1,
      1,
      '["יום רגיל","שישי","שבת","חג","חופשה","מחלה","מילואים","עבודה מהבית","אחר"]'
    )
    ON CONFLICT (id) DO NOTHING
  `);

  await ensureSeedData();
}

module.exports = {
  pool,
  query,
  initDb,
};
