require('dotenv').config();

const express = require('express');
const app = express();

app.set('trust proxy', true);

const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { query, initDb } = require('./db');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'vclock-secret';
const APP_TIMEZONE = 'Asia/Jerusalem';
const WEEK_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const REGULAR_DAY_TYPES = ['יום רגיל', 'עבודה מהבית'];
const SPECIAL_AUTO_CLOSE_TYPES = ['מילואים', 'מחלה', 'מחלת משפחה'];
const DEFAULT_WORK_DAY_TYPES = ['יום רגיל', 'שישי', 'שישי בתשלום', 'שבת', 'חג', 'חופשה', 'מחלה', 'מחלת משפחה', 'מילואים', 'עבודה מהבית', 'ארוחה', 'אחר'];
const ALLOWED_MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseWorkDayTypes(value) {
  const parsed = parseJsonArray(value);
  return parsed.length ? parsed : DEFAULT_WORK_DAY_TYPES;
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

function getNowInIsrael() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(new Date()).map((part) => [part.type, part.value])
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    dateString: `${parts.year}-${parts.month}-${parts.day}`,
    timeString: `${parts.hour}:${parts.minute}:${parts.second}`,
    dateTimeString: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
  };
}


function getWorkdayWindow(now = new Date()) {
  const start = new Date(now);
  start.setHours(3, 0, 0, 0);

  if (now.getHours() < 3) {
    start.setDate(start.getDate() - 1);
  }

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
}

function formatSqlDateTimeLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function getDateStringFromValue(value) {
  if (!value) return '';

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(value)).map((part) => [part.type, part.value])
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getWeekDayNameFromDateString(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return WEEK_DAYS[date.getUTCDay()];
}

function getTimeMinutes(timeValue) {
  const [hour, minute] = String(timeValue || '00:00').split(':').map(Number);
  return (hour || 0) * 60 + (minute || 0);
}

function getCurrentTimeMinutes() {
  const now = getNowInIsrael();
  return now.hour * 60 + now.minute;
}

function getWeekStartMs(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  const utcDate = Date.UTC(year, month - 1, day);
  const weekday = new Date(utcDate).getUTCDay();
  const sundayBasedDiff = weekday;
  return utcDate - sundayBasedDiff * 24 * 60 * 60 * 1000;
}

function calculateFridayAllowed(user, dateString) {
  const anchorDate = user.friday_rotation_anchor_date
    ? getDateStringFromValue(user.friday_rotation_anchor_date)
    : dateString;

  const baseAllowed = Number(user.friday_rotation_start_allowed || 0) === 1;
  const diffWeeks = Math.floor((getWeekStartMs(dateString) - getWeekStartMs(anchorDate)) / (7 * 24 * 60 * 60 * 1000));
  const isEven = Math.abs(diffWeeks) % 2 === 0;

  return isEven ? baseAllowed : !baseAllowed;
}

function shouldApplyRegularHours(workDayType) {
  return REGULAR_DAY_TYPES.includes(workDayType) || workDayType === 'שישי' || workDayType === 'שישי בתשלום';
}

function isSpecialAutoCloseType(workDayType) {
  return SPECIAL_AUTO_CLOSE_TYPES.includes(workDayType);
}

function buildActionTitle(recordType, workDayType) {
  const direction = recordType === 'in' ? 'פתיחה' : 'סגירה';
  return `${direction} - ${workDayType}`;
}


function normalizeMealType(value) {
  const normalized = String(value || '').trim();
  return ALLOWED_MEAL_TYPES.includes(normalized) ? normalized : '';
}

function getMealLabel(mealType) {
  if (mealType === 'breakfast') return 'ארוחת בוקר';
  if (mealType === 'lunch') return 'ארוחת צהריים';
  if (mealType === 'dinner') return 'ארוחת ערב';
  return '';
}

async function getNearestCityFromCoords(latitude, longitude) {
  if (!latitude || !longitude) return '';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&zoom=12&addressdetails=1`,
      {
        signal: controller.signal,
        headers: {
          'User-Agent': 'VClock/1.0',
          'Accept-Language': 'he,en'
        }
      }
    );

    if (!response.ok) return '';

    const data = await response.json();
    const address = data?.address || {};

    return address.city || address.town || address.village || address.municipality || address.state_district || '';
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}


function getMonthKeyFromDateValue(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getPreviousMonthKeyByIsraelDate(dateString) {
  const [year, month] = dateString.split('-').map(Number);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
}

async function ensureMonthlyLock() {
  const now = getNowInIsrael();
  if (now.day < 10) return;

  const prevMonthKey = getPreviousMonthKeyByIsraelDate(now.dateString);

  await query(
    `INSERT INTO period_locks (month_key, is_locked, locked_at)
     VALUES ($1, TRUE, NOW())
     ON CONFLICT (month_key) DO NOTHING`,
    [prevMonthKey]
  );
}

async function isMonthLocked(monthKey) {
  const result = await query(
    `SELECT id
     FROM period_locks
     WHERE month_key = $1
       AND is_locked = TRUE
     LIMIT 1`,
    [monthKey]
  );

  return Boolean(result.rows[0]);
}

async function getSettingsRow() {
  const result = await query(`SELECT * FROM settings WHERE id = 1`);
  return result.rows[0];
}

async function logAction({ userId = null, attendanceRecordId = null, actionType, actionTitle, details = '', createdByUserId = null }) {
  await query(
    `INSERT INTO action_logs (
       user_id,
       attendance_record_id,
       action_type,
       action_title,
       details,
       created_by_user_id,
       created_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [userId, attendanceRecordId, actionType, actionTitle, details, createdByUserId]
  );
}

async function ensureAutoCloseSpecialRecords() {
  const now = getNowInIsrael();

  if (getTimeMinutes(`${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')}`) < getTimeMinutes('15:45')) {
    return;
  }

  const openSessions = await query(
    `SELECT DISTINCT ON (r.user_id, DATE(r.record_time))
       r.id,
       r.user_id,
       r.record_type,
       r.work_day_type,
       r.note,
       r.record_time,
       DATE(r.record_time) AS work_date,
       u.full_name
     FROM attendance_records r
     JOIN users u ON u.id = r.user_id
     WHERE r.work_day_type = ANY($1::text[])
     ORDER BY r.user_id, DATE(r.record_time), r.record_time DESC, r.id DESC`,
    [SPECIAL_AUTO_CLOSE_TYPES]
  );

  for (const record of openSessions.rows) {
    if (record.record_type !== 'in') continue;

    const workDate = getDateStringFromValue(record.work_date);
    if (workDate !== now.dateString) continue;

    const existingOut = await query(
      `SELECT id
       FROM attendance_records
       WHERE user_id = $1
         AND DATE(record_time) = $2::date
         AND record_type = 'out'
         AND work_day_type = $3
       LIMIT 1`,
      [record.user_id, workDate, record.work_day_type]
    );

    if (existingOut.rows[0]) continue;

    const inserted = await query(
      `INSERT INTO attendance_records (
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
         created_at,
         approval_status,
         requires_admin_approval,
         exception_reason,
         manager_note,
         auto_closed,
         source_action,
         action_label
       )
       VALUES (
         $1,$2,$3,$4,'','','ok','','',
         ($5::date + TIME '15:45:00'),
         NOW(),
         'approved',
         0,
         '',
         '',
         1,
         'system_auto_close',
         $6
       )
       RETURNING *`,
      [
        record.user_id,
        'out',
        record.work_day_type,
        'סגירה אוטומטית בשעה 15:45',
        workDate,
        buildActionTitle('out', record.work_day_type)
      ]
    );

    await logAction({
      userId: record.user_id,
      attendanceRecordId: inserted.rows[0].id,
      actionType: 'attendance_auto_close',
      actionTitle: `סגירה אוטומטית - ${record.work_day_type}`,
      details: `המערכת סגרה אוטומטית עבור ${record.full_name || ''} בתאריך ${workDate} בשעה 15:45`,
      createdByUserId: null
    });
  }
}

async function resolveUserSchedule(userId) {
  const result = await query(
    `SELECT
       u.*,
       wg.name AS work_group_name,
       wg.work_days AS work_group_days
     FROM users u
     LEFT JOIN work_groups wg ON wg.id = u.work_group_id
     WHERE u.id = $1`,
    [userId]
  );

  const user = result.rows[0];
  if (!user) return null;

  return {
    ...user,
    allowed_work_days: normalizeWeekDays(parseJsonArray(user.allowed_work_days)),
    work_group_days: normalizeWeekDays(parseJsonArray(user.work_group_days))
  };
}

async function validateAttendanceRequest({ user, recordType, workDayType }) {
  const now = getNowInIsrael();
  const dateString = now.dateString;
  const weekDayName = getWeekDayNameFromDateString(dateString);
  const messages = [];
  let requiresAdminApproval = false;
  let approvalStatus = 'approved';
  let exceptionReason = '';

  const settings = await getSettingsRow();
  const holidays = await query(
    `SELECT holiday_name
     FROM holidays
     WHERE holiday_date = $1::date
       AND is_active = 1
     LIMIT 1`,
    [dateString]
  );
  const holiday = holidays.rows[0];

  const scheduleDays = user.allowed_work_days.length
    ? user.allowed_work_days
    : user.work_group_days;

  if (recordType === 'in' && scheduleDays.length && !scheduleDays.includes(weekDayName)) {
    requiresAdminApproval = true;
    approvalStatus = 'pending';
    exceptionReason = `היום ${weekDayName} אינו יום עבודה מוגדר לעובד`;
    messages.push(exceptionReason);
  }

  if (shouldApplyRegularHours(workDayType)) {
    const currentMinutes = getCurrentTimeMinutes();
    const startMinutes = getTimeMinutes('07:30');
    const endMinutes = getTimeMinutes('19:00');

    if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
      requiresAdminApproval = true;
      approvalStatus = 'pending';
      exceptionReason = exceptionReason || 'הדיווח בוצע מחוץ לשעות העבודה הרגילות 07:30-19:00';
      messages.push('הדיווח נרשם כחריגה מחוץ לשעות הרגילות וממתין לאישור מנהל');
    }
  }

  if (weekDayName === 'שישי' && workDayType === 'שישי') {
    const isAllowedFriday = calculateFridayAllowed(user, dateString);

    if (!isAllowedFriday) {
      requiresAdminApproval = true;
      approvalStatus = 'pending';
      exceptionReason = 'שישי זה אינו שישי העבודה של העובד. ניתן לרשום רק שישי בתשלום או לבקש אישור מנהל';
      messages.push(exceptionReason);
    }
  }

  if (weekDayName === 'שבת' && workDayType !== 'שישי בתשלום') {
    requiresAdminApproval = true;
    approvalStatus = 'pending';
    exceptionReason = 'עבודה ביום שבת מחייבת אישור מנהל';
    messages.push(exceptionReason);
  }

  if (holiday && workDayType !== 'שישי בתשלום') {
    requiresAdminApproval = true;
    approvalStatus = 'pending';
    exceptionReason = `עבודה ביום חג (${holiday.holiday_name}) מחייבת אישור מנהל`;
    messages.push(exceptionReason);
  }

  return {
    settings,
    holidayName: holiday ? holiday.holiday_name : '',
    requiresAdminApproval,
    approvalStatus,
    exceptionReason,
    message: messages.join(' | ')
  };
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

function createTwoFactorToken(user) {
  return jwt.sign(
    {
      id: user.id,
      employee_code: user.employee_code,
      full_name: user.full_name,
      role: user.role,
      purpose: '2fa_pending'
    },
    JWT_SECRET,
    { expiresIn: '10m' }
  );
}

function normalizeOtpToken(token) {
  return String(token || '').replace(/\s+/g, '').trim();
}

function verifyTotpCode(secret, token) {
  if (!secret) return false;

  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: normalizeOtpToken(token),
    window: 1
  });
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, port: PORT, timezone: APP_TIMEZONE });
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

    if (Number(user.twofa_enabled || 0) === 1 && user.twofa_secret) {
      const tempToken = createTwoFactorToken(user);

      return res.json({
        requiresTwoFactor: true,
        tempToken,
        user: {
          id: user.id,
          employee_code: user.employee_code,
          full_name: user.full_name,
          role: user.role
        }
      });
    }

    const token = createUserToken(user);

    await logAction({
      userId: user.id,
      actionType: 'login',
      actionTitle: 'כניסה למערכת',
      details: `${user.full_name} התחבר למערכת`,
      createdByUserId: user.id
    });

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


app.get('/api/2fa/status', authRequired, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, employee_code, full_name, role, twofa_enabled, twofa_secret
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [req.user.id]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }

    res.json({
      enabled: Number(user.twofa_enabled || 0) === 1,
      hasSecret: Boolean(user.twofa_secret)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/2fa/setup', authRequired, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, employee_code, full_name, twofa_secret, twofa_enabled
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [req.user.id]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }

    const secret = speakeasy.generateSecret({
      name: `VClock (${user.employee_code})`,
      issuer: 'VClock',
      length: 20
    });

    await query(
      `UPDATE users
       SET twofa_secret = $1,
           twofa_enabled = 0
       WHERE id = $2`,
      [secret.base32, user.id]
    );

    const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.json({
      enabled: false,
      secret: secret.base32,
      qrCodeDataUrl
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/2fa/enable', authRequired, async (req, res) => {
  try {
    const { token } = req.body;

    const result = await query(
      `SELECT id, full_name, twofa_secret
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [req.user.id]
    );

    const user = result.rows[0];
    if (!user || !user.twofa_secret) {
      return res.status(400).json({ error: 'יש ליצור קוד QR לפני ההפעלה' });
    }

    if (!verifyTotpCode(user.twofa_secret, token)) {
      return res.status(400).json({ error: 'קוד אימות לא תקין' });
    }

    await query(
      `UPDATE users
       SET twofa_enabled = 1
       WHERE id = $1`,
      [user.id]
    );

    await logAction({
      userId: user.id,
      actionType: '2fa-enable',
      actionTitle: 'הפעלת אימות דו-שלבי',
      details: `${user.full_name} הפעיל אימות דו-שלבי`,
      createdByUserId: user.id
    });

    res.json({ message: 'האימות הדו-שלבי הופעל בהצלחה' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/2fa/disable', authRequired, async (req, res) => {
  try {
    const { token } = req.body;

    const result = await query(
      `SELECT id, full_name, twofa_secret, twofa_enabled
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [req.user.id]
    );

    const user = result.rows[0];
    if (!user || Number(user.twofa_enabled || 0) !== 1 || !user.twofa_secret) {
      return res.status(400).json({ error: 'האימות הדו-שלבי לא מופעל' });
    }

    if (!verifyTotpCode(user.twofa_secret, token)) {
      return res.status(400).json({ error: 'קוד אימות לא תקין' });
    }

    await query(
      `UPDATE users
       SET twofa_enabled = 0,
           twofa_secret = NULL
       WHERE id = $1`,
      [user.id]
    );

    await logAction({
      userId: user.id,
      actionType: '2fa-disable',
      actionTitle: 'ביטול אימות דו-שלבי',
      details: `${user.full_name} ביטל אימות דו-שלבי`,
      createdByUserId: user.id
    });

    res.json({ message: 'האימות הדו-שלבי בוטל' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/2fa/verify-login', async (req, res) => {
  try {
    const { tempToken, token } = req.body;

    if (!tempToken) {
      return res.status(400).json({ error: 'חסר טוקן זמני' });
    }

    let pendingUser;
    try {
      pendingUser = jwt.verify(tempToken, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'פג תוקף האימות. התחבר מחדש.' });
    }

    if (pendingUser.purpose !== '2fa_pending') {
      return res.status(401).json({ error: 'טוקן אימות לא תקין' });
    }

    const result = await query(
      `SELECT *
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [pendingUser.id]
    );

    const user = result.rows[0];
    if (!user || !user.is_active) {
      return res.status(400).json({ error: 'משתמש לא קיים או חסום' });
    }

    if (Number(user.twofa_enabled || 0) !== 1 || !user.twofa_secret) {
      return res.status(400).json({ error: 'האימות הדו-שלבי אינו פעיל למשתמש זה' });
    }

    if (!verifyTotpCode(user.twofa_secret, token)) {
      return res.status(400).json({ error: 'קוד אימות לא תקין' });
    }

    const fullToken = createUserToken(user);

    await logAction({
      userId: user.id,
      actionType: 'login',
      actionTitle: 'כניסה למערכת עם אימות דו-שלבי',
      details: `${user.full_name} התחבר למערכת עם אימות דו-שלבי`,
      createdByUserId: user.id
    });

    res.json({
      token: fullToken,
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

app.get('/api/my-status', authRequired, async (req, res) => {
  try {
    await ensureMonthlyLock();
    await ensureAutoCloseSpecialRecords();

    const user = await resolveUserSchedule(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }

    const lastRes = await query(
      `SELECT *
       FROM attendance_records
       WHERE user_id = $1
       ORDER BY record_time DESC, id DESC
       LIMIT 1`,
      [req.user.id]
    );

    const settings = await getSettingsRow();
    const today = getNowInIsrael().dateString;
    const weekDayName = getWeekDayNameFromDateString(today);

    res.json({
      user,
      schedule: {
        allowed_work_days: user.allowed_work_days,
        work_group_id: user.work_group_id,
        work_group_name: user.work_group_name || '',
        work_group_days: user.work_group_days,
        friday_rotation_anchor_date: user.friday_rotation_anchor_date,
        friday_rotation_start_allowed: Number(user.friday_rotation_start_allowed || 0),
        friday_allowed_today: weekDayName === 'שישי' ? calculateFridayAllowed(user, today) : null
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
    await ensureMonthlyLock();
    await ensureAutoCloseSpecialRecords();

    const { start, end } = getWorkdayWindow();

    const result = await query(
      `SELECT *
       FROM attendance_records
       WHERE user_id = $1
         AND record_time >= $2::timestamp
         AND record_time < $3::timestamp
       ORDER BY record_time DESC, id DESC`,
      [req.user.id, formatSqlDateTimeLocal(start), formatSqlDateTimeLocal(end)]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/my-records-export', authRequired, async (req, res) => {
  try {
    await ensureMonthlyLock();
    await ensureAutoCloseSpecialRecords();

    const result = await query(
      `SELECT
         record_type,
         work_day_type,
         note,
         approval_status,
         requires_admin_approval,
         exception_reason,
         auto_closed,
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
      { header: 'Approval Status', key: 'approval_status', width: 18 },
      { header: 'Requires Admin Approval', key: 'requires_admin_approval', width: 20 },
      { header: 'Exception Reason', key: 'exception_reason', width: 35 },
      { header: 'Auto Closed', key: 'auto_closed', width: 12 },
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
    await ensureMonthlyLock();
    await ensureAutoCloseSpecialRecords();

    const {
      recordType,
      workDayType,
      note,
      latitude,
      longitude,
      location_status,
      meal_type
    } = req.body;

    if (!['in', 'out'].includes(recordType)) {
      return res.status(400).json({ error: 'סוג דיווח לא תקין' });
    }

    if (!workDayType) {
      return res.status(400).json({ error: 'יש לבחור סוג יום עבודה' });
    }

    const monthKey = getMonthKeyFromDateValue(new Date());
    if (await isMonthLocked(monthKey)) {
      return res.status(403).json({ error: 'החודש נעול לדיווח. יש לפנות למנהל.' });
    }

    const user = await resolveUserSchedule(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }

    const lastRes = await query(
      `SELECT *
       FROM attendance_records
       WHERE user_id = $1
       ORDER BY record_time DESC, id DESC
       LIMIT 1`,
      [req.user.id]
    );
    const lastRecord = lastRes.rows[0];

    const validation = await validateAttendanceRequest({
      user,
      recordType,
      workDayType
    });

    const normalizedMealType = normalizeMealType(meal_type);
    const mealCity = normalizedMealType && location_status === 'ok'
      ? await getNearestCityFromCoords(latitude, longitude)
      : '';

    if (recordType === 'in' && user.day_closed) {
      return res.status(400).json({ error: 'היום נסגר. יש לפנות למנהל לאישור פתיחה מחדש' });
    }

    if (
      recordType === 'in' &&
      validation.settings.prevent_double_checkin &&
      lastRecord &&
      lastRecord.record_type === 'in'
    ) {
      return res.status(400).json({
        error: 'לא ניתן לבצע כניסה שנייה באותו היום ויש לפנות למנהל המחלקה על מנת לשחרר את הרשומה'
      });
    }

    if (
      recordType === 'out' &&
      validation.settings.prevent_checkout_without_checkin &&
      (!lastRecord || lastRecord.record_type !== 'in')
    ) {
      return res.status(400).json({
        error: 'לא ניתן לבצע יציאה ללא כניסה קודמת'
      });
    }

    const inserted = await query(
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
         created_at,
         approval_status,
         requires_admin_approval,
         exception_reason,
         manager_note,
         auto_closed,
         source_action,
         action_label
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW(),$10,$11,$12,$13,$14,$15,$16)
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
        req.headers['user-agent'] || '',
        validation.approvalStatus,
        validation.requiresAdminApproval ? 1 : 0,
        validation.exceptionReason,
        '',
        0,
        'manual',
        buildActionTitle(recordType, workDayType),
        normalizedMealType,
        mealCity,
        normalizedMealType ? (latitude || '') : '',
        normalizedMealType ? (longitude || '') : ''
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

    await logAction({
      userId: req.user.id,
      attendanceRecordId: inserted.rows[0].id,
      actionType: 'attendance',
      actionTitle: buildActionTitle(recordType, workDayType),
      details: [
        `סוג יום: ${workDayType}`,
        note ? `הערה: ${note}` : '',
        validation.exceptionReason ? `חריגה: ${validation.exceptionReason}` : '',
        validation.requiresAdminApproval ? 'ממתין לאישור מנהל' : 'אושר אוטומטית',
        normalizedMealType ? `ארוחה: ${getMealLabel(normalizedMealType)}${mealCity ? ` (${mealCity})` : ''}` : ''
      ].filter(Boolean).join(' | '),
      createdByUserId: req.user.id
    });

    res.json({
      success: true,
      record_time: inserted.rows[0].record_time,
      approval_status: inserted.rows[0].approval_status,
      requires_admin_approval: inserted.rows[0].requires_admin_approval,
      exception_reason: inserted.rows[0].exception_reason,
      message: validation.message || '',
      meal_type: normalizedMealType,
      meal_city: mealCity
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/dashboard', authRequired, adminRequired, async (req, res) => {
  try {
    await ensureMonthlyLock();
    await ensureAutoCloseSpecialRecords();

    const totalUsers = await query(
      `SELECT COUNT(*)::int AS count FROM users WHERE role = 'employee'`
    );
    const activeUsers = await query(
      `SELECT COUNT(*)::int AS count FROM users WHERE role = 'employee' AND is_active = 1`
    );
    const totalRecords = await query(
      `SELECT COUNT(*)::int AS count FROM attendance_records`
    );
    const { start: workdayStart, end: workdayEnd } = getWorkdayWindow();

    const todayRecords = await query(
      `SELECT COUNT(*)::int AS count
       FROM attendance_records
       WHERE record_time >= $1::timestamp
         AND record_time < $2::timestamp`,
      [formatSqlDateTimeLocal(workdayStart), formatSqlDateTimeLocal(workdayEnd)]
    );
    const pendingApprovals = await query(
      `SELECT COUNT(*)::int AS count
       FROM attendance_records
       WHERE approval_status = 'pending'`
    );

    const actionRequests = await query(
      `SELECT id, employee_code, full_name
       FROM users
       WHERE role = 'employee'
         AND day_closed = 1
       ORDER BY full_name ASC`
    );

    const monthLocks = await query(`SELECT * FROM period_locks ORDER BY month_key DESC LIMIT 12`);

    res.json({
      totalUsers: totalUsers.rows[0].count,
      activeUsers: activeUsers.rows[0].count,
      totalRecords: totalRecords.rows[0].count,
      todayRecords: todayRecords.rows[0].count,
      pendingApprovals: pendingApprovals.rows[0].count,
      actionRequests: actionRequests.rows,
      monthLocks: monthLocks.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/reports', authRequired, adminRequired, async (req, res) => {
  try {
    await ensureMonthlyLock();
    await ensureAutoCloseSpecialRecords();

    const { employeeCode = '', fromDate = '', toDate = '', approvalStatus = '' } = req.query;

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
         AND ($4 = '' OR ar.approval_status = $4)
       ORDER BY ar.record_time DESC, ar.id DESC`,
      [employeeCode, fromDate, toDate, approvalStatus]
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



app.post('/api/admin/reports/manual', authRequired, adminRequired, async (req, res) => {
  try {
    await ensureMonthlyLock();

    const {
      user_id,
      record_type,
      work_day_type,
      note,
      manager_note,
      record_time
    } = req.body;

    if (!user_id || !record_type || !work_day_type || !record_time) {
      return res.status(400).json({ error: 'יש למלא עובד, סוג דיווח, סוג יום ותאריך' });
    }

    if (!['in', 'out'].includes(record_type)) {
      return res.status(400).json({ error: 'סוג דיווח לא תקין' });
    }

    const userRes = await query(
      `SELECT id, full_name, employee_code, is_active
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [user_id]
    );

    const user = userRes.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'העובד לא נמצא' });
    }

    if (!user.is_active) {
      return res.status(400).json({ error: 'לא ניתן ליצור דיווח לעובד חסום' });
    }

    const monthKey = getMonthKeyFromDateValue(record_time);
    if (await isMonthLocked(monthKey)) {
      return res.status(403).json({ error: 'החודש נעול. יש לשחרר את הנעילה לפני יצירת דיווח.' });
    }

    const inserted = await query(
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
         created_at,
         approval_status,
         requires_admin_approval,
         exception_reason,
         manager_note,
         auto_closed,
         source_action,
         action_label,
         is_edited,
         edited_at,
         edited_by
       )
       VALUES (
         $1,$2,$3,$4,'','','ok','','',$5::timestamp,NOW(),
         'approved',0,'',$6,0,'admin_manual','הוספה ידנית על ידי מנהל',TRUE,NOW(),$7
       )
       RETURNING *`,
      [
        user_id,
        record_type,
        work_day_type,
        note || '',
        record_time,
        manager_note || 'נוצר ידנית על ידי מנהל',
        req.user.id
      ]
    );

    if (record_type === 'out') {
      await query(
        `UPDATE users
         SET day_closed = 1
         WHERE id = $1`,
        [user_id]
      );
    }

    await logAction({
      userId: user_id,
      attendanceRecordId: inserted.rows[0].id,
      actionType: 'attendance_create_manual',
      actionTitle: 'יצירת דיווח ידני',
      details: `המנהל יצר דיווח ${record_type} עבור ${user.full_name} בתאריך ${record_time} | סוג יום: ${work_day_type}${note ? ` | הערה: ${note}` : ''}`,
      createdByUserId: req.user.id
    });

    res.json({ success: true, record: inserted.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/action-logs', authRequired, adminRequired, async (req, res) => {
  try {
    const { employeeCode = '', fromDate = '', toDate = '' } = req.query;

    const result = await query(
      `SELECT
         al.*,
         u.employee_code,
         u.full_name,
         ar.work_day_type,
         ar.record_type,
         ar.approval_status
       FROM action_logs al
       LEFT JOIN users u ON u.id = al.user_id
       LEFT JOIN attendance_records ar ON ar.id = al.attendance_record_id
       WHERE ($1 = '' OR COALESCE(u.employee_code, '') ILIKE '%' || $1 || '%' OR COALESCE(u.full_name, '') ILIKE '%' || $1 || '%')
         AND ($2 = '' OR DATE(al.created_at) >= $2::date)
         AND ($3 = '' OR DATE(al.created_at) <= $3::date)
       ORDER BY al.created_at DESC, al.id DESC`,
      [employeeCode, fromDate, toDate]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/reports/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const {
      work_day_type,
      note,
      manager_note,
      approval_status,
      record_type,
      record_time
    } = req.body;

    const currentRes = await query(`SELECT * FROM attendance_records WHERE id = $1`, [id]);
    const current = currentRes.rows[0];

    if (!current) {
      return res.status(404).json({ error: 'הרשומה לא נמצאה' });
    }

    const originalMonthKey = getMonthKeyFromDateValue(current.record_time);
    if (await isMonthLocked(originalMonthKey)) {
      return res.status(403).json({ error: 'החודש נעול. יש לשחרר את הנעילה לפני עריכה.' });
    }

    const normalizedApproval = ['approved', 'rejected', 'pending'].includes(approval_status)
      ? approval_status
      : null;
    const normalizedRecordType = ['in', 'out'].includes(record_type)
      ? record_type
      : null;

    const nextRecordTime = record_time || null;
    if (nextRecordTime) {
      const targetMonthKey = getMonthKeyFromDateValue(nextRecordTime);
      if (await isMonthLocked(targetMonthKey)) {
        return res.status(403).json({ error: 'חודש היעד נעול. יש לשחרר את הנעילה לפני שמירה.' });
      }
    }

    const updatedRes = await query(
      `UPDATE attendance_records
       SET work_day_type = COALESCE($1, work_day_type),
           note = COALESCE($2, note),
           manager_note = COALESCE($3, manager_note),
           approval_status = COALESCE($4, approval_status),
           requires_admin_approval = CASE WHEN COALESCE($4, approval_status) = 'pending' THEN 1 ELSE 0 END,
           record_type = COALESCE($5, record_type),
           record_time = COALESCE($6::timestamp, record_time),
           is_edited = TRUE,
           edited_at = NOW(),
           edited_by = $7
       WHERE id = $8
       RETURNING *`,
      [
        work_day_type || null,
        typeof note === 'string' ? note : null,
        typeof manager_note === 'string' ? manager_note : null,
        normalizedApproval,
        normalizedRecordType,
        nextRecordTime,
        req.user.id,
        id
      ]
    );

    const record = updatedRes.rows[0];

    await logAction({
      userId: record ? record.user_id : null,
      attendanceRecordId: id,
      actionType: 'attendance_edit',
      actionTitle: 'עריכת דיווח',
      details: `עודכנו נתוני דיווח על ידי מנהל`,
      createdByUserId: req.user.id
    });

    res.json({ success: true, record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/reports/:id/approval', authRequired, adminRequired, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const approvalStatus = ['approved', 'rejected', 'pending'].includes(req.body.approval_status)
      ? req.body.approval_status
      : 'approved';
    const managerNote = String(req.body.manager_note || '').trim();

    const updated = await query(
      `UPDATE attendance_records
       SET approval_status = $1,
           requires_admin_approval = CASE WHEN $1 = 'pending' THEN 1 ELSE 0 END,
           manager_note = $2
       WHERE id = $3
       RETURNING *`,
      [approvalStatus, managerNote, id]
    );

    if (!updated.rows[0]) {
      return res.status(404).json({ error: 'הרשומה לא נמצאה' });
    }

    await logAction({
      userId: updated.rows[0].user_id,
      attendanceRecordId: id,
      actionType: 'attendance_approval',
      actionTitle: 'אישור/דחיית דיווח',
      details: `הסטטוס עודכן ל-${approvalStatus}${managerNote ? ` | הערת מנהל: ${managerNote}` : ''}`,
      createdByUserId: req.user.id
    });

    res.json({ success: true, record: updated.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/reports/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    const recordRes = await query(`SELECT user_id FROM attendance_records WHERE id = $1`, [id]);
    const record = recordRes.rows[0];

    await query(
      `DELETE FROM attendance_records
       WHERE id = $1`,
      [id]
    );

    await logAction({
      userId: record ? record.user_id : null,
      attendanceRecordId: null,
      actionType: 'attendance_delete',
      actionTitle: 'מחיקת דיווח',
      details: `הרשומה ${id} נמחקה על ידי מנהל`,
      createdByUserId: req.user.id
    });

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

    await logAction({
      userId: null,
      attendanceRecordId: null,
      actionType: 'attendance_delete_many',
      actionTitle: 'מחיקה מרובה של דיווחים',
      details: `נמחקו ${ids.length} רשומות`,
      createdByUserId: req.user.id
    });

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

    await logAction({
      userId: null,
      attendanceRecordId: null,
      actionType: 'attendance_delete_filtered',
      actionTitle: 'מחיקת דיווחים לפי סינון',
      details: `בוצעה מחיקה לפי מסנן: עובד=${employeeCode || 'הכל'}, מתאריך=${fromDate || '-'}, עד תאריך=${toDate || '-'}`,
      createdByUserId: req.user.id
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/monthly-summary', authRequired, adminRequired, async (req, res) => {
  try {
    await ensureMonthlyLock();
    await ensureAutoCloseSpecialRecords();

    const { month } = req.query;

    if (!month) {
      return res.status(400).json({ error: 'חסר חודש' });
    }

    const settings = await getSettingsRow();
    const breakfastCost = Number(settings.breakfast_cost || 0);
    const lunchCost = Number(settings.lunch_cost || 0);
    const dinnerCost = Number(settings.dinner_cost || 0);

    const result = await query(
      `SELECT
         u.employee_code,
         u.full_name,
         DATE(ar.record_time) AS work_date,
         MIN(CASE WHEN ar.record_type = 'in' THEN ar.record_time END) AS first_in,
         MAX(CASE WHEN ar.record_type = 'out' THEN ar.record_time END) AS last_out,
         STRING_AGG(DISTINCT ar.work_day_type, ', ') AS work_day_types,
         BOOL_OR(ar.auto_closed = 1) AS has_auto_closed,
         BOOL_OR(ar.requires_admin_approval = 1) AS has_pending_approval,
         COUNT(*) FILTER (WHERE ar.meal_type = 'breakfast')::int AS breakfast_count,
         COUNT(*) FILTER (WHERE ar.meal_type = 'lunch')::int AS lunch_count,
         COUNT(*) FILTER (WHERE ar.meal_type = 'dinner')::int AS dinner_count
       FROM attendance_records ar
       JOIN users u ON u.id = ar.user_id
       WHERE TO_CHAR(ar.record_time, 'YYYY-MM') = $1
       GROUP BY u.employee_code, u.full_name, DATE(ar.record_time)
       ORDER BY work_date DESC, u.full_name ASC`,
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

      const breakfast_count = Number(r.breakfast_count || 0);
      const lunch_count = Number(r.lunch_count || 0);
      const dinner_count = Number(r.dinner_count || 0);
      const breakfast_total = breakfast_count * breakfastCost;
      const lunch_total = lunch_count * lunchCost;
      const dinner_total = dinner_count * dinnerCost;

      return {
        ...r,
        totalHours,
        breakfast_cost: breakfastCost,
        lunch_cost: lunchCost,
        dinner_cost: dinnerCost,
        breakfast_total,
        lunch_total,
        dinner_total,
        meals_total: breakfast_total + lunch_total + dinner_total
      };
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
         u.friday_rotation_anchor_date,
         u.friday_rotation_start_allowed,
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
    const {
      employee_code,
      full_name,
      password,
      role,
      is_active,
      work_group_id,
      allowed_work_days,
      friday_rotation_anchor_date,
      friday_rotation_start_allowed
    } = req.body;

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
         allowed_work_days,
         friday_rotation_anchor_date,
         friday_rotation_start_allowed
       )
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,$8,$9,$10)`,
      [
        String(employee_code),
        String(full_name),
        bcrypt.hashSync(String(password), 10),
        role === 'admin' ? 'admin' : 'employee',
        is_active ? 1 : 0,
        0,
        work_group_id ? parseInt(work_group_id, 10) : null,
        JSON.stringify(normalizeWeekDays(allowed_work_days)),
        friday_rotation_anchor_date || getNowInIsrael().dateString,
        friday_rotation_start_allowed ? 1 : 0
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
    const {
      employee_code,
      full_name,
      password,
      role,
      is_active,
      day_closed,
      work_group_id,
      allowed_work_days,
      friday_rotation_anchor_date,
      friday_rotation_start_allowed
    } = req.body;

    const userRes = await query(
      `SELECT * FROM users WHERE id = $1`,
      [id]
    );
    const user = userRes.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }

    const nextEmployeeCode = typeof employee_code !== 'undefined' ? String(employee_code).trim() : user.employee_code;
    const nextName = typeof full_name !== 'undefined' ? String(full_name) : user.full_name;
    const nextRole = typeof role !== 'undefined' ? (role === 'admin' ? 'admin' : 'employee') : user.role;
    const nextActive = typeof is_active !== 'undefined' ? (is_active ? 1 : 0) : user.is_active;
    const nextClosed = typeof day_closed !== 'undefined' ? (day_closed ? 1 : 0) : user.day_closed;
    const nextPasswordHash = password && String(password).trim() !== ''
      ? bcrypt.hashSync(String(password), 10)
      : user.password_hash;
    const nextWorkGroupId = typeof work_group_id !== 'undefined'
      ? (work_group_id ? parseInt(work_group_id, 10) : null)
      : user.work_group_id;
    const nextAllowedWorkDays = typeof allowed_work_days !== 'undefined'
      ? JSON.stringify(normalizeWeekDays(allowed_work_days))
      : user.allowed_work_days;
    const nextFridayAnchorDate = typeof friday_rotation_anchor_date !== 'undefined'
      ? (friday_rotation_anchor_date || getDateStringFromValue(user.friday_rotation_anchor_date) || getNowInIsrael().dateString)
      : user.friday_rotation_anchor_date;
    const nextFridayStartAllowed = typeof friday_rotation_start_allowed !== 'undefined'
      ? (friday_rotation_start_allowed ? 1 : 0)
      : user.friday_rotation_start_allowed;

    if (!nextEmployeeCode || !nextName) {
      return res.status(400).json({ error: 'יש למלא קוד עובד ושם מלא' });
    }

    const exists = await query(
      `SELECT id FROM users WHERE employee_code = $1 AND id <> $2`,
      [nextEmployeeCode, id]
    );

    if (exists.rows.length > 0) {
      return res.status(400).json({ error: 'קוד עובד כבר קיים' });
    }

    await query(
      `UPDATE users
       SET employee_code = $1,
           full_name = $2,
           password_hash = $3,
           role = $4,
           is_active = $5,
           day_closed = $6,
           work_group_id = $7,
           allowed_work_days = $8,
           friday_rotation_anchor_date = $9,
           friday_rotation_start_allowed = $10
       WHERE id = $11`,
      [
        nextEmployeeCode,
        nextName,
        nextPasswordHash,
        nextRole,
        nextActive,
        nextClosed,
        nextWorkGroupId,
        nextAllowedWorkDays,
        nextFridayAnchorDate,
        nextFridayStartAllowed,
        id
      ]
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

    await logAction({
      userId: id,
      attendanceRecordId: null,
      actionType: 'reopen_day',
      actionTitle: 'פתיחה מחדש של יום עבודה',
      details: 'מנהל פתח מחדש את יום העבודה לעובד',
      createdByUserId: req.user.id
    });

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
    const fridayRotationAnchorDate = req.body.friday_rotation_anchor_date || getNowInIsrael().dateString;
    const fridayRotationStartAllowed = req.body.friday_rotation_start_allowed ? 1 : 0;

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
           allowed_work_days = $2,
           friday_rotation_anchor_date = $3,
           friday_rotation_start_allowed = $4
       WHERE id = $5`,
      [workGroupId, JSON.stringify(allowedWorkDays), fridayRotationAnchorDate, fridayRotationStartAllowed, id]
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



app.post('/api/admin/period-locks/:monthKey/release', authRequired, adminRequired, async (req, res) => {
  try {
    const monthKey = String(req.params.monthKey || '').trim();

    await query(
      `UPDATE period_locks
       SET is_locked = FALSE,
           released_at = NOW(),
           released_by = $1
       WHERE month_key = $2`,
      [req.user.id, monthKey]
    );

    await logAction({
      userId: null,
      attendanceRecordId: null,
      actionType: 'release_month_lock',
      actionTitle: 'שחרור נעילת חודש',
      details: `המנהל שחרר את נעילת החודש ${monthKey}`,
      createdByUserId: req.user.id
    });

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

app.get('/api/admin/holidays', authRequired, adminRequired, async (req, res) => {
  try {
    const result = await query(
      `SELECT *
       FROM holidays
       WHERE is_active = 1
       ORDER BY holiday_date ASC`
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/holidays', authRequired, adminRequired, async (req, res) => {
  try {
    const holidayDate = String(req.body.holiday_date || '').trim();
    const holidayName = String(req.body.holiday_name || '').trim();

    if (!holidayDate || !holidayName) {
      return res.status(400).json({ error: 'יש למלא תאריך ושם חג' });
    }

    await query(
      `INSERT INTO holidays (holiday_date, holiday_name, is_active, created_at)
       VALUES ($1, $2, 1, NOW())
       ON CONFLICT (holiday_date)
       DO UPDATE SET holiday_name = EXCLUDED.holiday_name, is_active = 1`,
      [holidayDate, holidayName]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/holidays/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    await query(
      `DELETE FROM holidays WHERE id = $1`,
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
      work_day_types: parseWorkDayTypes(settings.work_day_types),
      breakfast_cost: Number(settings.breakfast_cost || 0),
      lunch_cost: Number(settings.lunch_cost || 0),
      dinner_cost: Number(settings.dinner_cost || 0)
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
           work_day_types = $4,
           breakfast_cost = $5,
           lunch_cost = $6,
           dinner_cost = $7
       WHERE id = 1`,
      [
        req.body.prevent_double_checkin ? 1 : 0,
        req.body.prevent_checkout_without_checkin ? 1 : 0,
        req.body.allow_multiple_sessions_per_day ? 1 : 0,
        JSON.stringify(workDayTypes.length ? workDayTypes : DEFAULT_WORK_DAY_TYPES),
        Number(req.body.breakfast_cost || 0),
        Number(req.body.lunch_cost || 0),
        Number(req.body.dinner_cost || 0)
      ]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/export', authRequired, adminRequired, async (req, res) => {
  try {
    await ensureMonthlyLock();
    await ensureAutoCloseSpecialRecords();

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
         ar.approval_status,
         ar.requires_admin_approval,
         ar.exception_reason,
         ar.manager_note,
         ar.auto_closed,
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
      { header: 'Approval Status', key: 'approval_status', width: 18 },
      { header: 'Requires Admin Approval', key: 'requires_admin_approval', width: 20 },
      { header: 'Exception Reason', key: 'exception_reason', width: 35 },
      { header: 'Manager Note', key: 'manager_note', width: 35 },
      { header: 'Auto Closed', key: 'auto_closed', width: 12 },
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
    await ensureMonthlyLock();
    await ensureAutoCloseSpecialRecords();

    const selectedDate = String(req.query.date || '').trim() || new Date().toISOString().slice(0, 10);
    const groupId = req.query.groupId ? parseInt(req.query.groupId, 10) : null;

    let groupName = 'כל הקטגוריות';
    if (groupId) {
      const groupRes = await query(`SELECT name FROM work_groups WHERE id = $1`, [groupId]);
      if (groupRes.rows[0]?.name) groupName = groupRes.rows[0].name;
    }

    const usersRes = await query(
      `SELECT u.id, u.full_name
       FROM users u
       WHERE u.role = 'employee'
         AND u.is_active = 1
         AND ($1::int IS NULL OR u.work_group_id = $1::int)
       ORDER BY u.full_name ASC`,
      [groupId]
    );
    const employees = usersRes.rows;
    const userIds = employees.map((u) => u.id);
    const totalEmployees = employees.length;

    let reported = 0;
    let ins = 0;
    let outs = 0;
    let missingEmployees = [];

    if (userIds.length) {
      const dayStats = await query(
        `SELECT
           COUNT(DISTINCT CASE WHEN record_type = 'in' THEN user_id END)::int AS reported,
           COUNT(*) FILTER (WHERE record_type = 'in')::int AS ins,
           COUNT(*) FILTER (WHERE record_type = 'out')::int AS outs
         FROM attendance_records
         WHERE DATE(record_time) = $1::date
           AND user_id = ANY($2::int[])`,
        [selectedDate, userIds]
      );
      reported = dayStats.rows[0]?.reported || 0;
      ins = dayStats.rows[0]?.ins || 0;
      outs = dayStats.rows[0]?.outs || 0;

      const missingRes = await query(
        `SELECT u.full_name, 1::int AS absences
         FROM users u
         WHERE u.id = ANY($2::int[])
           AND NOT EXISTS (
             SELECT 1
             FROM attendance_records ar
             WHERE ar.user_id = u.id
               AND DATE(ar.record_time) = $1::date
               AND ar.record_type = 'in'
           )
         ORDER BY u.full_name ASC
         LIMIT 10`,
        [selectedDate, userIds]
      );
      missingEmployees = missingRes.rows;
    }

    const heatmapRes = await query(
      `SELECT DATE(ar.record_time) AS day,
              COUNT(*)::int AS value
       FROM attendance_records ar
       JOIN users u ON u.id = ar.user_id
       WHERE ar.record_type = 'in'
         AND DATE(ar.record_time) >= ($1::date - INTERVAL '29 days')
         AND DATE(ar.record_time) <= $1::date
         AND ($2::int IS NULL OR u.work_group_id = $2::int)
       GROUP BY DATE(ar.record_time)
       ORDER BY DATE(ar.record_time) ASC`,
      [selectedDate, groupId]
    );

    res.json({
      meta: {
        selectedDate,
        groupId,
        groupName,
        totalEmployees,
        absenceCount: Math.max(totalEmployees - reported, 0)
      },
      daily: {
        reported,
        totalEmployees,
        notReported: Math.max(totalEmployees - reported, 0)
      },
      inOut: {
        ins,
        outs
      },
      absences: missingEmployees,
      heatmap: heatmapRes.rows
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
