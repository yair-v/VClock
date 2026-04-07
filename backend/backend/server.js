require('dotenv').config();

const express = require('express');
const app = express();

app.set('trust proxy', true);

const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');
const { query, initDb } = require('./db');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'vclock-secret';

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

const WEEK_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseWorkDayTypes(value) {
  return parseJsonArray(value);
}

function normalizeWeekDays(days) {
  const unique = [];
  const source = Array.isArray(days) ? days : [];

  for (const item of source) {
    const value = String(item || '').trim();
    if (!WEEK_DAYS.includes(value)) continue;
    if (unique.includes(value)) continue;
    unique.push(value);
  }

  return WEEK_DAYS.filter((day) => unique.includes(day));
}

async function getSettingsRow() {
  const result = await query(`SELECT * FROM settings WHERE id = 1`);
  return result.rows[0];
}

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminRequired(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}

async function getUserByLoginValue(loginValue) {
  const result = await query(
    `SELECT *
     FROM users
     WHERE employee_code = $1
        OR LOWER(full_name) = LOWER($1)
     ORDER BY id ASC
     LIMIT 1`,
    [String(loginValue || '').trim()]
  );
  return result.rows[0];
}

function createUserToken(user) {
  return jwt.sign(
    {
      id: user.id,
      employee_code: user.employee_code,
      full_name: user.full_name,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, port: PORT });
});

app.post('/api/login', async (req, res) => {
  try {
    const { employeeCode, password } = req.body;
    const user = await getUserByLoginValue(employeeCode);

    if (!user || !user.is_active) {
      return res.status(400).json({ error: 'משתמש לא קיים או חסום' });
    }

    if (!bcrypt.compareSync(String(password), user.password_hash)) {
      return res.status(400).json({ error: 'סיסמה שגויה' });
    }

    const token = createUserToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        employee_code: user.employee_code,
        full_name: user.full_name,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/my-status', authRequired, async (req, res) => {
  try {
    const userRes = await query(
      `SELECT
         u.id,
         u.employee_code,
         u.full_name,
         u.role,
         u.is_active,
         u.day_closed,
         u.work_group_id,
         u.allowed_work_days,
         wg.name AS work_group_name,
         wg.work_days AS work_group_days
       FROM users u
       LEFT JOIN work_groups wg ON wg.id = u.work_group_id
       WHERE u.id = $1`,
      [req.user.id]
    );

    const lastRes = await query(
      `SELECT *
       FROM attendance_records
       WHERE user_id = $1
       ORDER BY record_time DESC
       LIMIT 1`,
      [req.user.id]
    );

    const settings = await getSettingsRow();
    const user = userRes.rows[0];
    const allowedWorkDays = normalizeWeekDays(parseJsonArray(user.allowed_work_days));
    const groupWorkDays = normalizeWeekDays(parseJsonArray(user.work_group_days));

    res.json({
      user: {
        ...user,
        allowed_work_days: allowedWorkDays,
        work_group_days: groupWorkDays
      },
      schedule: {
        allowed_work_days: allowedWorkDays,
        work_group_id: user.work_group_id,
        work_group_name: user.work_group_name || '',
        work_group_days: groupWorkDays
      },
      lastRecord: lastRes.rows[0] || null,
      workDayTypes: parseWorkDayTypes(settings.work_day_types),
      settings: {
        prevent_double_checkin: settings.prevent_double_checkin,
        prevent_checkout_without_checkin: settings.prevent_checkout_without_checkin,
        allow_multiple_sessions_per_day: settings.allow_multiple_sessions_per_day
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/my-records', authRequired, async (req, res) => {
  try {
    const result = await query(
      `SELECT *
       FROM attendance_records
       WHERE user_id = $1
         AND DATE(record_time) = CURRENT_DATE
       ORDER BY record_time DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/my-records-export', authRequired, async (req, res) => {
  try {
    const result = await query(
      `SELECT
         record_type,
         work_day_type,
         note,
         record_time
       FROM attendance_records
       WHERE user_id = $1
       ORDER BY record_time DESC`,
      [req.user.id]
    );

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('My Attendance');

    ws.columns = [
      { header: 'Record Type', key: 'record_type', width: 14 },
      { header: 'Work Day Type', key: 'work_day_type', width: 18 },
      { header: 'Note', key: 'note', width: 30 },
      { header: 'Record Time', key: 'record_time', width: 25 }
    ];

    result.rows.forEach((r) => ws.addRow(r));

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=VClock_My_Records_${req.user.employee_code}.xlsx`
    );

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/attendance', authRequired, async (req, res) => {
  try {
    const {
      recordType,
      workDayType,
      note,
      latitude,
      longitude,
      location_status
    } = req.body;

    if (!['in', 'out'].includes(recordType)) {
      return res.status(400).json({ error: 'סוג דיווח לא תקין' });
    }

    if (!workDayType) {
      return res.status(400).json({ error: 'יש לבחור סוג יום עבודה' });
    }

    const settings = await getSettingsRow();

    const userRes = await query(
      `SELECT * FROM users WHERE id = $1`,
      [req.user.id]
    );
    const user = userRes.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }

    const lastRes = await query(
      `SELECT *
       FROM attendance_records
       WHERE user_id = $1
       ORDER BY record_time DESC
       LIMIT 1`,
      [req.user.id]
    );
    const lastRecord = lastRes.rows[0];

    if (recordType === 'in' && user.day_closed) {
      return res.status(400).json({ error: 'היום נסגר. יש לפנות למנהל לאישור פתיחה מחדש' });
    }

    if (
      recordType === 'in' &&
      settings.prevent_double_checkin &&
      lastRecord &&
      lastRecord.record_type === 'in'
    ) {
      return res.status(400).json({
        error: 'לא ניתן לבצע כניסה שנייה באותו היום ויש לפנות למנהל המחלקה על מנת לשחרר את הרשומה'
      });
    }

    if (
      recordType === 'out' &&
      settings.prevent_checkout_without_checkin &&
      (!lastRecord || lastRecord.record_type !== 'in')
    ) {
      return res.status(400).json({
        error: 'לא ניתן לבצע יציאה ללא כניסה קודמת'
      });
    }

    const result = await query(
      `INSERT INTO attendance_records
       (
         user_id,
         record_type,
         work_day_type,
         note,
         latitude,
         longitude,
         location_status,
         ip_address,
         device_info,
         record_time,
         created_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
       RETURNING *`,
      [
        req.user.id,
        recordType,
        workDayType,
        note || '',
        latitude || '',
        longitude || '',
        location_status || 'ok',
        req.ip || '',
        req.headers['user-agent'] || ''
      ]
    );

    if (recordType === 'out') {
      await query(
        `UPDATE users
         SET day_closed = 1
         WHERE id = $1`,
        [req.user.id]
      );
    }

    res.json({
      success: true,
      record_time: result.rows[0].record_time
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/dashboard', authRequired, adminRequired, async (req, res) => {
  try {
    const totalUsers = await query(
      `SELECT COUNT(*)::int AS count FROM users WHERE role = 'employee'`
    );
    const activeUsers = await query(
      `SELECT COUNT(*)::int AS count FROM users WHERE role = 'employee' AND is_active = 1`
    );
    const totalRecords = await query(
      `SELECT COUNT(*)::int AS count FROM attendance_records`
    );
    const todayRecords = await query(
      `SELECT COUNT(*)::int AS count
       FROM attendance_records
       WHERE DATE(record_time) = CURRENT_DATE`
    );

    const actionRequests = await query(
      `SELECT id, employee_code, full_name
       FROM users
       WHERE role = 'employee'
         AND day_closed = 1
       ORDER BY full_name ASC`
    );

    res.json({
      totalUsers: totalUsers.rows[0].count,
      activeUsers: activeUsers.rows[0].count,
      totalRecords: totalRecords.rows[0].count,
      todayRecords: todayRecords.rows[0].count,
      actionRequests: actionRequests.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/reports', authRequired, adminRequired, async (req, res) => {
  try {
    const { employeeCode = '', fromDate = '', toDate = '' } = req.query;

    const result = await query(
      `SELECT
         ar.*,
         u.employee_code,
         u.full_name
       FROM attendance_records ar
       JOIN users u ON u.id = ar.user_id
       WHERE ($1 = '' OR u.employee_code ILIKE '%' || $1 || '%' OR u.full_name ILIKE '%' || $1 || '%')
         AND ($2 = '' OR DATE(ar.record_time) >= $2::date)
         AND ($3 = '' OR DATE(ar.record_time) <= $3::date)
       ORDER BY ar.record_time DESC`,
      [employeeCode, fromDate, toDate]
    );

    const rows = result.rows.map((r) => ({
      ...r,
      map_link:
        r.latitude && r.longitude
          ? `https://www.google.com/maps?q=${r.latitude},${r.longitude}`
          : ''
    }));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/reports/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { work_day_type, note } = req.body;

    await query(
      `UPDATE attendance_records
       SET work_day_type = $1,
           note = $2
       WHERE id = $3`,
      [work_day_type || 'יום רגיל', note || '', id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/reports/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    await query(
      `DELETE FROM attendance_records
       WHERE id = $1`,
      [id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/reports/delete-many', authRequired, adminRequired, async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(v => parseInt(v, 10)).filter(Boolean) : [];

    if (!ids.length) {
      return res.status(400).json({ error: 'לא נבחרו שורות למחיקה' });
    }

    await query(
      `DELETE FROM attendance_records
       WHERE id = ANY($1::int[])`,
      [ids]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/reports/delete-filtered', authRequired, adminRequired, async (req, res) => {
  try {
    const {
      employeeCode = '',
      fromDate = '',
      toDate = ''
    } = req.body || {};

    await query(
      `DELETE FROM attendance_records ar
       USING users u
       WHERE u.id = ar.user_id
         AND ($1 = '' OR u.employee_code ILIKE '%' || $1 || '%' OR u.full_name ILIKE '%' || $1 || '%')
         AND ($2 = '' OR DATE(ar.record_time) >= $2::date)
         AND ($3 = '' OR DATE(ar.record_time) <= $3::date)`,
      [employeeCode, fromDate, toDate]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/monthly-summary', authRequired, adminRequired, async (req, res) => {
  try {
    const { month } = req.query;

    if (!month) {
      return res.status(400).json({ error: 'חסר חודש' });
    }

    const result = await query(
      `SELECT
         u.employee_code,
         u.full_name,
         DATE(ar.record_time) AS work_date,
         MIN(CASE WHEN ar.record_type = 'in' THEN ar.record_time END) AS first_in,
         MAX(CASE WHEN ar.record_type = 'out' THEN ar.record_time END) AS last_out
       FROM attendance_records ar
       JOIN users u ON u.id = ar.user_id
       WHERE TO_CHAR(ar.record_time, 'YYYY-MM') = $1
       GROUP BY u.employee_code, u.full_name, DATE(ar.record_time)
       ORDER BY work_date DESC`,
      [month]
    );

    const rows = result.rows.map((r) => {
      let totalHours = '';
      if (r.first_in && r.last_out) {
        totalHours = Math.max(
          0,
          (new Date(r.last_out) - new Date(r.first_in)) / 3600000
        ).toFixed(2);
      }
      return { ...r, totalHours };
    });

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/users', authRequired, adminRequired, async (req, res) => {
  try {
    const result = await query(
      `SELECT
         u.id,
         u.employee_code,
         u.full_name,
         u.role,
         u.is_active,
         u.day_closed,
         u.created_at,
         u.work_group_id,
         u.allowed_work_days,
         wg.name AS work_group_name,
         wg.work_days AS work_group_days
       FROM users u
       LEFT JOIN work_groups wg ON wg.id = u.work_group_id
       ORDER BY u.employee_code ASC`
    );

    res.json(result.rows.map((row) => ({
      ...row,
      allowed_work_days: normalizeWeekDays(parseJsonArray(row.allowed_work_days)),
      work_group_days: normalizeWeekDays(parseJsonArray(row.work_group_days))
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/users', authRequired, adminRequired, async (req, res) => {
  try {
    const { employee_code, full_name, password, role, is_active, work_group_id, allowed_work_days } = req.body;

    if (!employee_code || !full_name || !password) {
      return res.status(400).json({ error: 'יש למלא קוד, שם וסיסמה' });
    }

    const exists = await query(
      `SELECT id FROM users WHERE employee_code = $1`,
      [String(employee_code)]
    );

    if (exists.rows.length > 0) {
      return res.status(400).json({ error: 'קוד עובד כבר קיים' });
    }

    await query(
      `INSERT INTO users (
         employee_code,
         full_name,
         password_hash,
         role,
         is_active,
         day_closed,
         created_at,
         work_group_id,
         allowed_work_days
       )
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,$8)`,
      [
        String(employee_code),
        String(full_name),
        bcrypt.hashSync(String(password), 10),
        role === 'admin' ? 'admin' : 'employee',
        is_active ? 1 : 0,
        0,
        work_group_id ? parseInt(work_group_id, 10) : null,
        JSON.stringify(normalizeWeekDays(allowed_work_days))
      ]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/users/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { full_name, password, role, is_active, day_closed, work_group_id, allowed_work_days } = req.body;

    const userRes = await query(
      `SELECT * FROM users WHERE id = $1`,
      [id]
    );
    const user = userRes.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }

    const nextName =
      typeof full_name !== 'undefined' ? String(full_name) : user.full_name;

    const nextRole =
      typeof role !== 'undefined'
        ? (role === 'admin' ? 'admin' : 'employee')
        : user.role;

    const nextActive =
      typeof is_active !== 'undefined'
        ? (is_active ? 1 : 0)
        : user.is_active;

    const nextClosed =
      typeof day_closed !== 'undefined'
        ? (day_closed ? 1 : 0)
        : user.day_closed;

    const nextPasswordHash =
      password && String(password).trim() !== ''
        ? bcrypt.hashSync(String(password), 10)
        : user.password_hash;

    const nextWorkGroupId =
      typeof work_group_id !== 'undefined'
        ? (work_group_id ? parseInt(work_group_id, 10) : null)
        : user.work_group_id;

    const nextAllowedWorkDays =
      typeof allowed_work_days !== 'undefined'
        ? JSON.stringify(normalizeWeekDays(allowed_work_days))
        : user.allowed_work_days;

    await query(
      `UPDATE users
       SET full_name = $1,
           password_hash = $2,
           role = $3,
           is_active = $4,
           day_closed = $5,
           work_group_id = $6,
           allowed_work_days = $7
       WHERE id = $8`,
      [nextName, nextPasswordHash, nextRole, nextActive, nextClosed, nextWorkGroupId, nextAllowedWorkDays, id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/users/:id/reopen-day', authRequired, adminRequired, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    await query(
      `UPDATE users
       SET day_closed = 0
       WHERE id = $1`,
      [id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/users/:id/work-schedule', authRequired, adminRequired, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const workGroupId = req.body.work_group_id ? parseInt(req.body.work_group_id, 10) : null;
    const allowedWorkDays = normalizeWeekDays(req.body.allowed_work_days);

    const userRes = await query(
      `SELECT id FROM users WHERE id = $1`,
      [id]
    );

    if (!userRes.rows[0]) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }

    if (workGroupId) {
      const groupRes = await query(
        `SELECT id FROM work_groups WHERE id = $1`,
        [workGroupId]
      );

      if (!groupRes.rows[0]) {
        return res.status(400).json({ error: 'קבוצת העבודה שנבחרה לא קיימת' });
      }
    }

    await query(
      `UPDATE users
       SET work_group_id = $1,
           allowed_work_days = $2
       WHERE id = $3`,
      [workGroupId, JSON.stringify(allowedWorkDays), id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    const userRes = await query(
      `SELECT * FROM users WHERE id = $1`,
      [id]
    );
    const user = userRes.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }

    if (user.employee_code === 'admin') {
      return res.status(400).json({ error: 'לא ניתן למחוק את משתמש המנהל הראשי' });
    }

    await query(`DELETE FROM users WHERE id = $1`, [id]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/work-groups', authRequired, adminRequired, async (req, res) => {
  try {
    const result = await query(
      `SELECT
         wg.*,
         (
           SELECT COUNT(*)::int
           FROM users u
           WHERE u.work_group_id = wg.id
         ) AS users_count
       FROM work_groups wg
       ORDER BY wg.name ASC`
    );

    res.json(result.rows.map((row) => ({
      ...row,
      work_days: normalizeWeekDays(parseJsonArray(row.work_days))
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/work-groups', authRequired, adminRequired, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const description = String(req.body.description || '').trim();
    const workDays = normalizeWeekDays(req.body.work_days);

    if (!name) {
      return res.status(400).json({ error: 'יש להזין שם קבוצה' });
    }

    if (!workDays.length) {
      return res.status(400).json({ error: 'יש לבחור לפחות יום עבודה אחד' });
    }

    await query(
      `INSERT INTO work_groups (name, description, work_days, is_active, created_at)
       VALUES ($1, $2, $3, 1, NOW())`,
      [name, description, JSON.stringify(workDays)]
    );

    res.json({ success: true });
  } catch (err) {
    if (String(err.message || '').includes('duplicate key')) {
      return res.status(400).json({ error: 'שם הקבוצה כבר קיים' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/work-groups/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const name = String(req.body.name || '').trim();
    const description = String(req.body.description || '').trim();
    const workDays = normalizeWeekDays(req.body.work_days);
    const isActive = req.body.is_active ? 1 : 0;

    if (!name) {
      return res.status(400).json({ error: 'יש להזין שם קבוצה' });
    }

    if (!workDays.length) {
      return res.status(400).json({ error: 'יש לבחור לפחות יום עבודה אחד' });
    }

    await query(
      `UPDATE work_groups
       SET name = $1,
           description = $2,
           work_days = $3,
           is_active = $4
       WHERE id = $5`,
      [name, description, JSON.stringify(workDays), isActive, id]
    );

    res.json({ success: true });
  } catch (err) {
    if (String(err.message || '').includes('duplicate key')) {
      return res.status(400).json({ error: 'שם הקבוצה כבר קיים' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/work-groups/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    const used = await query(
      `SELECT COUNT(*)::int AS count FROM users WHERE work_group_id = $1`,
      [id]
    );

    if (used.rows[0] && used.rows[0].count > 0) {
      return res.status(400).json({ error: 'לא ניתן למחוק קבוצה שמשויכת למשתמשים' });
    }

    await query(
      `DELETE FROM work_groups WHERE id = $1`,
      [id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/settings', authRequired, adminRequired, async (req, res) => {
  try {
    const settings = await getSettingsRow();

    res.json({
      ...settings,
      work_day_types: parseWorkDayTypes(settings.work_day_types)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/settings', authRequired, adminRequired, async (req, res) => {
  try {
    const workDayTypes = Array.isArray(req.body.work_day_types)
      ? req.body.work_day_types.filter(Boolean)
      : [];

    await query(
      `UPDATE settings
       SET prevent_double_checkin = $1,
           prevent_checkout_without_checkin = $2,
           allow_multiple_sessions_per_day = $3,
           work_day_types = $4
       WHERE id = 1`,
      [
        req.body.prevent_double_checkin ? 1 : 0,
        req.body.prevent_checkout_without_checkin ? 1 : 0,
        req.body.allow_multiple_sessions_per_day ? 1 : 0,
        JSON.stringify(workDayTypes)
      ]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/export', authRequired, adminRequired, async (req, res) => {
  try {
    const result = await query(
      `SELECT
         u.employee_code,
         u.full_name,
         ar.record_type,
         ar.work_day_type,
         ar.note,
         ar.latitude,
         ar.longitude,
         ar.location_status,
         ar.record_time
       FROM attendance_records ar
       JOIN users u ON u.id = ar.user_id
       ORDER BY ar.record_time DESC`
    );

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Attendance');

    ws.columns = [
      { header: 'Employee Code', key: 'employee_code', width: 15 },
      { header: 'Full Name', key: 'full_name', width: 25 },
      { header: 'Record Type', key: 'record_type', width: 12 },
      { header: 'Work Day Type', key: 'work_day_type', width: 18 },
      { header: 'Note', key: 'note', width: 30 },
      { header: 'Latitude', key: 'latitude', width: 16 },
      { header: 'Longitude', key: 'longitude', width: 16 },
      { header: 'Location Status', key: 'location_status', width: 20 },
      { header: 'Record Time', key: 'record_time', width: 25 }
    ];

    result.rows.forEach((r) => ws.addRow(r));

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=VClock_Attendance.xlsx'
    );

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/shutdown', authRequired, adminRequired, (req, res) => {
  res.json({ success: true });
  setTimeout(() => process.exit(0), 500);
});
app.get('/api/admin/dashboard-stats', authRequired, adminRequired, async (req, res) => {
  try {
    // עובדים ביום
    const daily = await query(`
      SELECT DATE(record_time) as day,
             COUNT(DISTINCT user_id) as count
      FROM attendance_records
      WHERE record_type = 'in'
      GROUP BY day
      ORDER BY day ASC
    `);

    // כניסות ויציאות
    const inOut = await query(`
      SELECT DATE(record_time) as day,
             COUNT(*) FILTER (WHERE record_type = 'in') as ins,
             COUNT(*) FILTER (WHERE record_type = 'out') as outs
      FROM attendance_records
      GROUP BY day
      ORDER BY day ASC
    `);

    // חיסורים
    const absences = await query(`
      SELECT
        u.full_name,
        COUNT(*) FILTER (
          WHERE NOT EXISTS (
            SELECT 1 FROM attendance_records ar
            WHERE ar.user_id = u.id
            AND DATE(ar.record_time) = d.day
            AND ar.record_type = 'in'
          )
        ) as absences
      FROM users u,
      generate_series(
        CURRENT_DATE - INTERVAL '30 days',
        CURRENT_DATE,
        '1 day'
      ) as d(day)
      WHERE u.role = 'employee'
      GROUP BY u.full_name
      ORDER BY absences DESC
      LIMIT 10
    `);

    // Heatmap
    const heatmap = await query(`
      SELECT DATE(record_time) as day,
             COUNT(*) as value
      FROM attendance_records
      WHERE record_type = 'in'
      GROUP BY day
    `);

    res.json({
      daily: daily.rows,
      inOut: inOut.rows,
      absences: absences.rows,
      heatmap: heatmap.rows
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`VClock PostgreSQL running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('DB init failed:', err);
    process.exit(1);
  });