require('dotenv').config();

const express = require('express');
const app = express();

app.set('trust proxy', true);

const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');
const { pool, query, initDb } = require('./db');

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
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/login', async (req, res) => {
  const { employeeCode, password } = req.body;

  const result = await query(
    'SELECT * FROM users WHERE employee_code = $1',
    [String(employeeCode)]
  );

  const user = result.rows[0];

  if (!user || !user.is_active) {
    return res.status(400).json({ error: 'משתמש לא קיים או חסום' });
  }

  if (!bcrypt.compareSync(String(password), user.password_hash)) {
    return res.status(400).json({ error: 'סיסמה שגויה' });
  }

  const token = jwt.sign(user, JWT_SECRET, { expiresIn: '12h' });

  res.json({ token, user });
});

app.post('/api/attendance', authRequired, async (req, res) => {
  const { recordType, workDayType, note } = req.body;

  const last = await query(
    `SELECT * FROM attendance_records 
     WHERE user_id = $1 
     ORDER BY record_time DESC LIMIT 1`,
    [req.user.id]
  );

  const lastRecord = last.rows[0];

  const settingsRes = await query(`SELECT * FROM settings WHERE id = 1`);
  const settings = settingsRes.rows[0];

  if (recordType === 'in' && settings.prevent_double_checkin && lastRecord?.record_type === 'in') {
    return res.status(400).json({ error: 'כבר בוצעה כניסה' });
  }

  if (recordType === 'out' && settings.prevent_checkout_without_checkin && (!lastRecord || lastRecord.record_type !== 'in')) {
    return res.status(400).json({ error: 'אין כניסה לפני יציאה' });
  }

  await query(
    `INSERT INTO attendance_records (user_id, record_type, work_day_type, note)
     VALUES ($1,$2,$3,$4)`,
    [req.user.id, recordType, workDayType, note || '']
  );

  res.json({ success: true });
});

app.get('/api/admin/users', authRequired, adminRequired, async (req, res) => {
  const result = await query(
    `SELECT id, employee_code, full_name, role, is_active, created_at FROM users`
  );
  res.json(result.rows);
});

app.delete('/api/admin/users/:id', authRequired, adminRequired, async (req, res) => {
  const id = parseInt(req.params.id);

  const user = await query(`SELECT * FROM users WHERE id=$1`, [id]);

  if (!user.rows[0]) {
    return res.status(404).json({ error: 'לא נמצא' });
  }

  if (user.rows[0].employee_code === 'admin') {
    return res.status(400).json({ error: 'אסור למחוק אדמין' });
  }

  await query(`DELETE FROM users WHERE id=$1`, [id]);

  res.json({ success: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`VClock PostgreSQL running on ${PORT}`);
  });
});