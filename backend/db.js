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

async function ensurePeriodLocksSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS period_locks (
      id SERIAL PRIMARY KEY,
      month_key TEXT UNIQUE NOT NULL,
      is_locked BOOLEAN NOT NULL DEFAULT TRUE,
      locked_at TIMESTAMP NOT NULL DEFAULT NOW(),
      released_at TIMESTAMP NULL,
      released_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  await query(`
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT FALSE
  `);

  await query(`
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP NULL
  `);

  await query(`
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS edited_by INTEGER NULL
  `);

  await query(`
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS meal_type TEXT NOT NULL DEFAULT ''
  `);

  await query(`
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS meal_city TEXT NOT NULL DEFAULT ''
  `);

  await query(`
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS meal_latitude TEXT NOT NULL DEFAULT ''
  `);

  await query(`
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS meal_longitude TEXT NOT NULL DEFAULT ''
  `);

  await query(`
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS missing_checkout BOOLEAN DEFAULT FALSE
  `);

  await query(`
    ALTER TABLE settings
    ADD COLUMN IF NOT EXISTS breakfast_cost NUMERIC(10,2) NOT NULL DEFAULT 0
  `);

  await query(`
    ALTER TABLE settings
    ADD COLUMN IF NOT EXISTS lunch_cost NUMERIC(10,2) NOT NULL DEFAULT 0
  `);

  await query(`
    ALTER TABLE settings
    ADD COLUMN IF NOT EXISTS dinner_cost NUMERIC(10,2) NOT NULL DEFAULT 0
  `);
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
       (
         employee_code,
         full_name,
         password_hash,
         role,
         is_active,
         day_closed,
         allowed_work_days,
         friday_rotation_anchor_date,
         friday_rotation_start_allowed
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, $8)`,
      ['admin', 'System Admin', hash, 'admin', 1, 0, '[]', 1]
    );
  }
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
      work_day_types TEXT DEFAULT '["יום רגיל","שישי","שישי בתשלום","שבת","חג","ערב חג","חול המועד","חופשה","מחלה","מחלת משפחה","מילואים","עבודה מהבית","ארוחה","אחר"]'
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
    CREATE TABLE IF NOT EXISTS holidays (
      id SERIAL PRIMARY KEY,
      holiday_date DATE UNIQUE NOT NULL,
      holiday_name TEXT NOT NULL,
      holiday_type TEXT NOT NULL DEFAULT 'manual',
      holiday_scope TEXT NOT NULL DEFAULT 'manual',
      blocks_regular_work INTEGER NOT NULL DEFAULT 1,
      requires_admin_approval INTEGER NOT NULL DEFAULT 1,
      default_work_day_type TEXT NOT NULL DEFAULT 'חג',
      source TEXT NOT NULL DEFAULT 'manual',
      source_year INTEGER NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS action_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
      attendance_record_id INTEGER NULL REFERENCES attendance_records(id) ON DELETE SET NULL,
      action_type TEXT NOT NULL,
      action_title TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      created_by_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS day_closed INTEGER NOT NULL DEFAULT 0
  `);

  await query(`
    ALTER TABLE holidays
    ADD COLUMN IF NOT EXISTS holiday_type TEXT NOT NULL DEFAULT 'manual'
  `);

  await query(`
    ALTER TABLE holidays
    ADD COLUMN IF NOT EXISTS holiday_scope TEXT NOT NULL DEFAULT 'manual'
  `);

  await query(`
    ALTER TABLE holidays
    ADD COLUMN IF NOT EXISTS blocks_regular_work INTEGER NOT NULL DEFAULT 1
  `);

  await query(`
    ALTER TABLE holidays
    ADD COLUMN IF NOT EXISTS requires_admin_approval INTEGER NOT NULL DEFAULT 1
  `);

  await query(`
    ALTER TABLE holidays
    ADD COLUMN IF NOT EXISTS default_work_day_type TEXT NOT NULL DEFAULT 'חג'
  `);

  await query(`
    ALTER TABLE holidays
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
  `);

  await query(`
    ALTER TABLE holidays
    ADD COLUMN IF NOT EXISTS source_year INTEGER NULL
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
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS friday_rotation_anchor_date DATE NULL
  `);

  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS friday_rotation_start_allowed INTEGER NOT NULL DEFAULT 1
  `);

  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS twofa_secret TEXT NULL
  `);

  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS twofa_enabled INTEGER NOT NULL DEFAULT 0
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
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'
  `);

  await query(`
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS requires_admin_approval INTEGER NOT NULL DEFAULT 0
  `);

  await query(`
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS exception_reason TEXT NOT NULL DEFAULT ''
  `);

  await query(`
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS manager_note TEXT NOT NULL DEFAULT ''
  `);

  await query(`
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS auto_closed INTEGER NOT NULL DEFAULT 0
  `);

  await query(`
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS source_action TEXT NOT NULL DEFAULT 'manual'
  `);

  await query(`
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS action_label TEXT NOT NULL DEFAULT ''
  `);

  await query(`
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS calendar_holiday_name TEXT NOT NULL DEFAULT ''
  `);

  await query(`
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS calendar_holiday_type TEXT NOT NULL DEFAULT ''
  `);

  await query(`
    ALTER TABLE settings
    ADD COLUMN IF NOT EXISTS work_day_types TEXT DEFAULT '["יום רגיל","שישי","שישי בתשלום","שבת","חג","חופשה","מחלה","מחלת משפחה","מילואים","עבודה מהבית","ארוחה","אחר"]'
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
    CREATE TABLE IF NOT EXISTS departments (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // 🔥 שדה למחלקה אצל עובדים
  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS department_id INTEGER
  `);

  await query(`
    UPDATE users
    SET friday_rotation_anchor_date = COALESCE(friday_rotation_anchor_date, CURRENT_DATE)
  `);

  // חשוב: קודם נוסיף את כל עמודות הנעילות/עריכות/ארוחות/עלויות
  await ensurePeriodLocksSchema();

  // ורק אחרי זה נכניס/נעדכן settings עם עמודות העלות
  await query(`
    INSERT INTO settings (
      id,
      prevent_double_checkin,
      prevent_checkout_without_checkin,
      allow_multiple_sessions_per_day,
      work_day_types,
      breakfast_cost,
      lunch_cost,
      dinner_cost
    )
    VALUES (
      1,
      1,
      1,
      1,
      '["יום רגיל","שישי","שישי בתשלום","שבת","חג","ערב חג","חול המועד","חופשה","מחלה","מחלת משפחה","מילואים","עבודה מהבית","ארוחה","אחר"]',
      0,
      0,
      0
    )
    ON CONFLICT (id) DO UPDATE SET
      work_day_types = EXCLUDED.work_day_types
  `);

  await ensureSeedData();
}

module.exports = {
  pool,
  query,
  initDb,
};