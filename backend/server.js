const express = require('express');
const app = express();

app.set('trust proxy', true);

const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'vclock-stable-local-secret';
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'db.json');

require('dotenv').config();

app.use(cors({
  origin: '*'
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function ensureDb() {
  const dir = path.dirname(DB_FILE);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    const adminHash = bcrypt.hashSync('1234', 10);
    const empHash = bcrypt.hashSync('1234', 10);
    const db = {
      users: [
        { id: 1, employee_code: 'admin', full_name: 'System Admin', password_hash: adminHash, role: 'admin', is_active: 1, created_at: new Date().toISOString() },
        { id: 2, employee_code: '1001', full_name: 'Demo Employee', password_hash: empHash, role: 'employee', is_active: 1, created_at: new Date().toISOString() }
      ],
      attendance_records: [],
      settings: {
        prevent_double_checkin: 1,
        prevent_checkout_without_checkin: 1
      },
      counters: {
        users: 2,
        attendance_records: 0
      }
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
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
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

function nowIso() {
  return new Date().toISOString();
}

function fmtDateOnly(s) {
  return new Date(s).toISOString().slice(0, 10);
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, port: PORT });
});

app.post('/api/login', (req, res) => {
  try {
    const { employeeCode, password } = req.body;
    const db = readDb();
    const user = db.users.find(u => u.employee_code === String(employeeCode));
    if (!user || !user.is_active) {
      return res.status(400).json({ error: 'משתמש לא קיים או חסום' });
    }
    if (!bcrypt.compareSync(String(password), user.password_hash)) {
      return res.status(400).json({ error: 'סיסמה שגויה' });
    }
    const token = jwt.sign(
      { id: user.id, employee_code: user.employee_code, full_name: user.full_name, role: user.role },
      JWT_SECRET,
      { expiresIn: '12h' }
    );
    res.json({ token, user: { id: user.id, employee_code: user.employee_code, full_name: user.full_name, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/my-records', authRequired, (req, res) => {
  const db = readDb();
  const rows = db.attendance_records
    .filter(r => r.user_id === req.user.id)
    .sort((a, b) => (a.record_time < b.record_time ? 1 : -1))
    .slice(0, 100);
  res.json(rows);
});

app.post('/api/attendance', authRequired, (req, res) => {
  try {
    const { recordType, workDayType, note, latitude, longitude } = req.body;
    if (!['in', 'out'].includes(recordType)) {
      return res.status(400).json({ error: 'סוג דיווח לא תקין' });
    }
    if (!workDayType) {
      return res.status(400).json({ error: 'יש לבחור סוג יום עבודה' });
    }

    const db = readDb();
    const lastRecord = db.attendance_records
      .filter(r => r.user_id === req.user.id)
      .sort((a, b) => (a.record_time < b.record_time ? 1 : -1))[0];

    if (recordType === 'in' && db.settings.prevent_double_checkin && lastRecord && lastRecord.record_type === 'in') {
      return res.status(400).json({ error: 'לא ניתן לבצע כניסה כפולה ללא יציאה' });
    }

    if (recordType === 'out' && db.settings.prevent_checkout_without_checkin) {
      if (!lastRecord || lastRecord.record_type !== 'in') {
        return res.status(400).json({ error: 'לא ניתן לבצע יציאה ללא כניסה קודמת' });
      }
    }

    db.counters.attendance_records += 1;
    const rec = {
      id: db.counters.attendance_records,
      user_id: req.user.id,
      record_type: recordType,
      work_day_type: workDayType,
      note: note || '',
      latitude: latitude || '',
      longitude: longitude || '',
      ip_address: req.ip || '',
      device_info: req.headers['user-agent'] || '',
      record_time: nowIso(),
      created_at: nowIso()
    };

    db.attendance_records.push(rec);
    writeDb(db);
    res.json({ success: true, record_time: rec.record_time });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/dashboard', authRequired, adminRequired, (req, res) => {
  const db = readDb();
  res.json({
    totalUsers: db.users.filter(u => u.role === 'employee').length,
    activeUsers: db.users.filter(u => u.role === 'employee' && u.is_active).length,
    totalRecords: db.attendance_records.length,
    todayRecords: db.attendance_records.filter(r => fmtDateOnly(r.record_time) === fmtDateOnly(nowIso())).length
  });
});

app.get('/api/admin/reports', authRequired, adminRequired, (req, res) => {
  const { employeeCode = '', fromDate = '', toDate = '' } = req.query;
  const db = readDb();

  const rows = db.attendance_records
    .map(r => {
      const u = db.users.find(x => x.id === r.user_id) || {};
      return { ...r, employee_code: u.employee_code || '', full_name: u.full_name || '' };
    })
    .filter(r => {
      const byEmp = !employeeCode || r.employee_code.includes(employeeCode) || r.full_name.includes(employeeCode);
      const byFrom = !fromDate || fmtDateOnly(r.record_time) >= fromDate;
      const byTo = !toDate || fmtDateOnly(r.record_time) <= toDate;
      return byEmp && byFrom && byTo;
    })
    .sort((a, b) => (a.record_time < b.record_time ? 1 : -1));

  res.json(rows);
});

app.get('/api/admin/monthly-summary', authRequired, adminRequired, (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: 'חסר חודש' });

  const db = readDb();
  const filtered = db.attendance_records.filter(r => String(r.record_time).slice(0, 7) === month);
  const groups = {};

  for (const r of filtered) {
    const u = db.users.find(x => x.id === r.user_id) || {};
    const day = fmtDateOnly(r.record_time);
    const key = `${u.employee_code}__${day}`;
    if (!groups[key]) {
      groups[key] = {
        employee_code: u.employee_code || '',
        full_name: u.full_name || '',
        work_date: day,
        first_in: '',
        last_out: ''
      };
    }
    if (r.record_type === 'in') {
      if (!groups[key].first_in || r.record_time < groups[key].first_in) groups[key].first_in = r.record_time;
    }
    if (r.record_type === 'out') {
      if (!groups[key].last_out || r.record_time > groups[key].last_out) groups[key].last_out = r.record_time;
    }
  }

  const rows = Object.values(groups)
    .map(r => {
      let totalHours = '';
      if (r.first_in && r.last_out) {
        totalHours = Math.max(0, (new Date(r.last_out) - new Date(r.first_in)) / 3600000).toFixed(2);
      }
      return { ...r, totalHours };
    })
    .sort((a, b) => (a.work_date < b.work_date ? 1 : -1));

  res.json(rows);
});

app.get('/api/admin/users', authRequired, adminRequired, (req, res) => {
  const db = readDb();
  const rows = [...db.users]
    .sort((a, b) => String(a.employee_code).localeCompare(String(b.employee_code)))
    .map(({ password_hash, ...rest }) => rest);
  res.json(rows);
});

app.post('/api/admin/users', authRequired, adminRequired, (req, res) => {
  try {
    const { employee_code, full_name, password, role, is_active } = req.body;
    if (!employee_code || !full_name || !password) {
      return res.status(400).json({ error: 'יש למלא קוד, שם וסיסמה' });
    }

    const db = readDb();
    if (db.users.some(u => u.employee_code === String(employee_code))) {
      return res.status(400).json({ error: 'קוד עובד כבר קיים' });
    }

    db.counters.users += 1;
    db.users.push({
      id: db.counters.users,
      employee_code: String(employee_code),
      full_name: String(full_name),
      password_hash: bcrypt.hashSync(String(password), 10),
      role: role === 'admin' ? 'admin' : 'employee',
      is_active: is_active ? 1 : 0,
      created_at: nowIso()
    });

    writeDb(db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.put('/api/admin/users/:id', authRequired, adminRequired, (req, res) => {
  try {
    const db = readDb();
    const id = parseInt(req.params.id, 10);

    const user = db.users.find(u => u.id === id);
    if (!user) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }

    const { full_name, password, role, is_active } = req.body;

    if (typeof full_name !== 'undefined') user.full_name = String(full_name);
    if (typeof role !== 'undefined') user.role = role === 'admin' ? 'admin' : 'employee';
    if (typeof is_active !== 'undefined') user.is_active = is_active ? 1 : 0;

    if (password && String(password).trim() !== '') {
      user.password_hash = bcrypt.hashSync(String(password), 10);
    }

    writeDb(db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:id', authRequired, adminRequired, (req, res) => {
  try {
    const db = readDb();
    const id = parseInt(req.params.id, 10);

    const user = db.users.find(u => u.id === id);
    if (!user) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }

    if (user.employee_code === 'admin') {
      return res.status(400).json({ error: 'לא ניתן למחוק את משתמש המנהל הראשי' });
    }

    db.users = db.users.filter(u => u.id !== id);
    db.attendance_records = db.attendance_records.filter(r => r.user_id !== id);

    writeDb(db);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/settings', authRequired, adminRequired, (req, res) => {
  const db = readDb();
  res.json(db.settings);
});

app.put('/api/admin/settings', authRequired, adminRequired, (req, res) => {
  const db = readDb();
  db.settings.prevent_double_checkin = req.body.prevent_double_checkin ? 1 : 0;
  db.settings.prevent_checkout_without_checkin = req.body.prevent_checkout_without_checkin ? 1 : 0;
  writeDb(db);
  res.json({ success: true });
});

app.get('/api/admin/export', authRequired, adminRequired, async (req, res) => {
  const db = readDb();
  const rows = db.attendance_records
    .map(r => {
      const u = db.users.find(x => x.id === r.user_id) || {};
      return {
        employee_code: u.employee_code || '',
        full_name: u.full_name || '',
        record_type: r.record_type,
        work_day_type: r.work_day_type,
        note: r.note || '',
        record_time: r.record_time
      };
    })
    .sort((a, b) => (a.record_time < b.record_time ? 1 : -1));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Attendance');
  ws.columns = [
    { header: 'Employee Code', key: 'employee_code', width: 15 },
    { header: 'Full Name', key: 'full_name', width: 25 },
    { header: 'Record Type', key: 'record_type', width: 12 },
    { header: 'Work Day Type', key: 'work_day_type', width: 18 },
    { header: 'Note', key: 'note', width: 30 },
    { header: 'Record Time', key: 'record_time', width: 25 }
  ];
  rows.forEach(r => ws.addRow(r));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=VClock_Attendance.xlsx');
  await wb.xlsx.write(res);
  res.end();
});

app.post('/api/admin/shutdown', authRequired, adminRequired, (req, res) => {
  res.json({ success: true });
  setTimeout(() => process.exit(0), 500);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

ensureDb();
app.listen(PORT, () => {
  console.log(`VClock stable running on http://localhost:${PORT}`);
});
