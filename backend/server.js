require('dotenv').config();

const express = require('express');
const app = express();

app.set('trust proxy', true);

const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');
const crypto = require('crypto');

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const { query, initDb } = require('./db');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'vclock-secret';
const RP_NAME = process.env.WEBAUTHN_RP_NAME || 'VClock';
const RP_ID = process.env.WEBAUTHN_RP_ID || process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost';
const ORIGIN = process.env.WEBAUTHN_ORIGIN || (process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`);

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

function parseWorkDayTypes(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

// Passkey / WebAuthn registration
app.post('/api/passkeys/register/options', authRequired, async (req, res) => {
  try {
    const existing = await query(
      `SELECT credential_id
       FROM passkeys
       WHERE user_id = $1`,
      [req.user.id]
    );

    const webauthnUserId = Buffer.from(`vclock:${req.user.id}`, 'utf8').toString('base64url');

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: req.user.employee_code,
      userDisplayName: req.user.full_name,
      userID: webauthnUserId,
      timeout: 60000,
      attestationType: 'none',
      excludeCredentials: existing.rows.map(r => ({
        id: r.credential_id,
        type: 'public-key',
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      supportedAlgorithmIDs: [-7, -257],
    });

    await query(
      `UPDATE users
       SET created_at = created_at
       WHERE id = $1`,
      [req.user.id]
    );

    req.app.locals.passkeyRegistrationChallenges = req.app.locals.passkeyRegistrationChallenges || new Map();
    req.app.locals.passkeyRegistrationChallenges.set(String(req.user.id), options.challenge);

    res.json({
      ...options,
      user: {
        ...(options.user || {}),
        id: webauthnUserId,
        name: req.user.employee_code,
        displayName: req.user.full_name
      },
      userId: webauthnUserId
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/passkeys/register/verify', authRequired, async (req, res) => {
  try {
    const expectedChallenge =
      req.app.locals.passkeyRegistrationChallenges?.get(String(req.user.id));

    if (!expectedChallenge) {
      return res.status(400).json({ error: 'Challenge registration missing' });
    }

    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: false,
    });

    const { verified, registrationInfo } = verification;

    if (!verified || !registrationInfo) {
      return res.status(400).json({ error: 'Passkey registration failed' });
    }

    await query(
      `INSERT INTO passkeys
       (user_id, webauthn_user_id, credential_id, public_key, counter, device_type, backed_up, transports)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (credential_id) DO NOTHING`,
      [
        req.user.id,
        Buffer.from(`vclock:${req.user.id}`, 'utf8').toString('base64url'),
        Buffer.from(registrationInfo.credential.id).toString('base64url'),
        registrationInfo.credential.publicKey.toString('base64url'),
        registrationInfo.credential.counter,
        registrationInfo.credentialDeviceType || '',
        !!registrationInfo.credentialBackedUp,
        JSON.stringify(req.body.response?.transports || []),
      ]
    );

    req.app.locals.passkeyRegistrationChallenges.delete(String(req.user.id));

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Passkey / WebAuthn authentication
app.post('/api/passkeys/auth/options', async (req, res) => {
  try {
    const { employeeCode } = req.body;
    const user = await getUserByLoginValue(employeeCode);

    if (!user || !user.is_active) {
      return res.status(400).json({ error: 'משתמש לא קיים או חסום' });
    }

    const passkeys = await query(
      `SELECT *
       FROM passkeys
       WHERE user_id = $1`,
      [user.id]
    );

    if (!passkeys.rows.length) {
      return res.status(400).json({ error: 'לא הוגדר זיהוי ביומטרי לעובד זה' });
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: passkeys.rows.map(p => ({
        id: Buffer.from(p.credential_id, 'base64url'),
        type: 'public-key',
        transports: JSON.parse(p.transports || '[]'),
      })),
      userVerification: 'preferred',
      timeout: 60000,
    });


    req.app.locals.passkeyAuthChallenges = req.app.locals.passkeyAuthChallenges || new Map();
    req.app.locals.passkeyAuthChallenges.set(String(user.id), options.challenge);

    res.json({
      ...options,
      userId: user.id,
      employee_code: user.employee_code,
      full_name: user.full_name,
      role: user.role,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/passkeys/auth/verify', async (req, res) => {
  try {
    const { userId, credential } = req.body;

    const userRes = await query(`SELECT * FROM users WHERE id = $1`, [userId]);
    const user = userRes.rows[0];

    if (!user || !user.is_active) {
      return res.status(400).json({ error: 'משתמש לא קיים או חסום' });
    }

    const expectedChallenge =
      req.app.locals.passkeyAuthChallenges?.get(String(user.id));

    if (!expectedChallenge) {
      return res.status(400).json({ error: 'Challenge authentication missing' });
    }

    const credentialRes = await query(
      `SELECT *
       FROM passkeys
       WHERE credential_id = $1`,
      [credential.id]
    );

    const dbPasskey = credentialRes.rows[0];

    if (!dbPasskey) {
      return res.status(400).json({ error: 'Passkey לא נמצא' });
    }

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: dbPasskey.credential_id,
        publicKey: Buffer.from(dbPasskey.public_key, 'base64url'),
        counter: Number(dbPasskey.counter),
        transports: JSON.parse(dbPasskey.transports || '[]'),
      },
      requireUserVerification: false,
    });

    if (!verification.verified) {
      return res.status(400).json({ error: 'אימות ביומטרי נכשל' });
    }

    await query(
      `UPDATE passkeys
       SET counter = $1
       WHERE id = $2`,
      [verification.authenticationInfo.newCounter, dbPasskey.id]
    );

    req.app.locals.passkeyAuthChallenges.delete(String(user.id));

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
      `SELECT id, employee_code, full_name, role, is_active, day_closed
       FROM users
       WHERE id = $1`,
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

    const todayRowsRes = await query(
      `SELECT *
       FROM attendance_records
       WHERE user_id = $1
         AND DATE(record_time) = CURRENT_DATE
       ORDER BY record_time ASC`,
      [req.user.id]
    );

    const settings = await getSettingsRow();
    const todayRows = todayRowsRes.rows || [];

    let hasOpenWorkSessionToday = false;
    if (todayRows.length) {
      const lastTodayRecord = todayRows[todayRows.length - 1];
      hasOpenWorkSessionToday = lastTodayRecord.record_type === 'in';
    }

    res.json({
      user: userRes.rows[0],
      lastRecord: lastRes.rows[0] || null,
      todayRecords: todayRows,
      hasOpenWorkSessionToday,
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
         id,
         employee_code,
         full_name,
         role,
         is_active,
         day_closed,
         created_at
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
      `INSERT INTO users (
         employee_code,
         full_name,
         password_hash,
         role,
         is_active,
         day_closed,
         created_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [
        String(employee_code),
        String(full_name),
        bcrypt.hashSync(String(password), 10),
        role === 'admin' ? 'admin' : 'employee',
        is_active ? 1 : 0,
        0
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
    const { full_name, password, role, is_active, day_closed } = req.body;

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

    await query(
      `UPDATE users
       SET full_name = $1,
           password_hash = $2,
           role = $3,
           is_active = $4,
           day_closed = $5
       WHERE id = $6`,
      [nextName, nextPasswordHash, nextRole, nextActive, nextClosed, id]
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