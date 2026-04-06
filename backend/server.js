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
app.use(express.static(path.join(__dirname, 'public')));

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

app.get('/api/health', (req, res) => {
  res.json({ ok: true, port: PORT });
});

app.post('/api/login', async (req, res) => {
  try {
    const { employeeCode, password } = req.body;

    const result = await query(
      `SELECT * FROM users WHERE employee_code = $1`,
      [String(employeeCode)]
    );

    const user = result.rows[0];

    if (!user || !user.is_active) {
      return res.status(400).json({ error: 'משתמש לא קיים או חסום' });
    }

    if (!bcrypt.compareSync(String(password), user.password_hash)) {
      return res.status(400).json({ error: 'סיסמה שגויה' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        employee_code: user.employee_code,
        full_name: user.full_name,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

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

app.get('/api/my-records', authRequired, async (req, res) => {
  try {
    const result = await query(
      `SELECT *
       FROM attendance_records
       WHERE user_id = $1
       ORDER BY record_time DESC
       LIMIT 100`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/attendance', authRequired, async (req, res) => {
  try {
    const { recordType, workDayType, note, latitude, longitude } = req.body;

    if (!['in', 'out'].includes(recordType)) {
      return res.status(400).json({ error: 'סוג דיווח לא תקין' });
    }

    if (!workDayType) {
      return res.status(400).json({ error: 'יש לבחור סוג יום עבודה' });
    }

    const settingsRes = await query(
      `SELECT * FROM settings WHERE id = 1`
    );
    const settings = settingsRes.rows[0];

    const lastRes = await query(
      `SELECT *
       FROM attendance_records
       WHERE user_id = $1
       ORDER BY record_time DESC
       LIMIT 1`,
      [req.user.id]
    );

    const lastRecord = lastRes.rows[0];

    if (
      recordType === 'in' &&
      settings.prevent_double_checkin &&
      lastRecord &&
      lastRecord.record_type === 'in'
    ) {
      return res.status(400).json({ error: 'לא ניתן לבצע כניסה כפולה ללא יציאה' });
    }

    if (
      recordType === 'out' &&
      settings.prevent_checkout_without_checkin &&
      (!lastRecord || lastRecord.record_type !== 'in')
    ) {
      return res.status(400).json({ error: 'לא ניתן לבצע יציאה ללא כניסה קודמת' });
    }

    const result = await query(
      `INSERT INTO attendance_records
       (user_id, record_type, work_day_type, note, latitude, longitude, ip_address, device_info, record_time, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
       RETURNING *`,
      [
        req.user.id,
        recordType,
        workDayType,
        note || '',
        latitude || '',
        longitude || '',
        req.ip || '',
        req.headers['user-agent'] || ''
      ]
    );

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

    res.json({
      totalUsers: totalUsers.rows[0].count,
      activeUsers: activeUsers.rows[0].count,
      totalRecords: totalRecords.rows[0].count,
      todayRecords: todayRecords.rows[0].count
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

    res.json(result.rows);
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
      `SELECT id, employee_code, full_name, role, is_active, created_at
       FROM users
       ORDER BY employee_code ASC`
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/users', authRequired, adminRequired, async (req, res) => {
  try {
    const { employee_code, full_name, password, role, is_active } = req.body;

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
      `INSERT INTO users (employee_code, full_name, password_hash, role, is_active, created_at)
       VALUES ($1,$2,$3,$4,$5,NOW())`,
      [
        String(employee_code),
        String(full_name),
        bcrypt.hashSync(String(password), 10),
        role === 'admin' ? 'admin' : 'employee',
        is_active ? 1 : 0
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
    const { full_name, password, role, is_active } = req.body;

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

    const nextPasswordHash =
      password && String(password).trim() !== ''
        ? bcrypt.hashSync(String(password), 10)
        : user.password_hash;

    await query(
      `UPDATE users
       SET full_name = $1,
           password_hash = $2,
           role = $3,
           is_active = $4
       WHERE id = $5`,
      [nextName, nextPasswordHash, nextRole, nextActive, id]
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

app.get('/api/admin/settings', authRequired, adminRequired, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM settings WHERE id = 1`
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/settings', authRequired, adminRequired, async (req, res) => {
  try {
    await query(
      `UPDATE settings
       SET prevent_double_checkin = $1,
           prevent_checkout_without_checkin = $2,
           allow_multiple_sessions_per_day = $3
       WHERE id = 1`,
      [
        req.body.prevent_double_checkin ? 1 : 0,
        req.body.prevent_checkout_without_checkin ? 1 : 0,
        req.body.allow_multiple_sessions_per_day ? 1 : 0
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