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
const ROLE_LABELS = { employee: 'עובד', work_manager: 'מנהל עבודה', admin: 'מנהל מערכת' };
const ROLE_RANKS = { employee: 1, work_manager: 2, admin: 3 };
const ALLOWED_ROLES = Object.keys(ROLE_LABELS);

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

function parseClientDateTime(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const [, y, m, d, h, min, sec = '00'] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(min);
  const second = Number(sec);

  if (
    !year || month < 1 || month > 12 || day < 1 || day > 31 ||
    hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59
  ) {
    return null;
  }

  const sql = `${y}-${m}-${d} ${h}:${min}:${String(second).padStart(2, '0')}`;
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    sql,
    dateString: `${y}-${m}-${d}`,
    timeString: `${h}:${min}:${String(second).padStart(2, '0')}`,
    minutes: hour * 60 + minute
  };
}

function israelWallClockToMs(parts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0);
}

function subtractHoursFromIsraelNow(hours) {
  const nowIsrael = getNowInIsrael();
  const utcLike = new Date(Date.UTC(
    nowIsrael.year,
    nowIsrael.month - 1,
    nowIsrael.day,
    nowIsrael.hour,
    nowIsrael.minute,
    nowIsrael.second
  ));
  utcLike.setUTCHours(utcLike.getUTCHours() - hours);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    year: utcLike.getUTCFullYear(),
    month: utcLike.getUTCMonth() + 1,
    day: utcLike.getUTCDate(),
    hour: utcLike.getUTCHours(),
    minute: utcLike.getUTCMinutes(),
    second: utcLike.getUTCSeconds(),
    sql: `${utcLike.getUTCFullYear()}-${pad(utcLike.getUTCMonth() + 1)}-${pad(utcLike.getUTCDate())} ${pad(utcLike.getUTCHours())}:${pad(utcLike.getUTCMinutes())}:${pad(utcLike.getUTCSeconds())}`
  };
}

function resolveRecordDateTime(recordDateTime) {
  const nowIsrael = getNowInIsrael();
  const requested = recordDateTime ? parseClientDateTime(recordDateTime) : parseClientDateTime(nowIsrael.dateTimeString);

  if (!requested) {
    return { error: 'תאריך או שעה אינם תקינים' };
  }

  const oldestAllowed = subtractHoursFromIsraelNow(72);
  const requestedMs = israelWallClockToMs(requested);
  const nowMs = israelWallClockToMs(nowIsrael);
  const oldestMs = israelWallClockToMs(oldestAllowed);

  if (requestedMs < oldestMs) {
    return { error: 'ניתן לדווח עד 72 שעות אחורה בלבד' };
  }

  // השוואה לפי שעון ישראל בלבד. לא משתמשים ב-UTC של השרת כדי למנוע קפיצות של 2/3 שעות.
  if (requestedMs > nowMs + 10 * 60 * 1000) {
    return { error: 'לא ניתן לדווח על תאריך או שעה עתידיים' };
  }

  return {
    date: new Date(Date.UTC(requested.year, requested.month - 1, requested.day, requested.hour, requested.minute, requested.second)),
    sql: requested.sql,
    dateString: requested.dateString,
    timeString: requested.timeString,
    minutes: requested.minutes
  };
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

function getCurrentTimeMinutes(fallbackMinutes = null) {
  if (typeof fallbackMinutes === 'number') return fallbackMinutes;
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

function normalizeNfcUid(value) {
  return String(value || '')
    .replace(/[^0-9a-fA-F]/g, '')
    .toUpperCase()
    .trim();
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
       wg.work_days AS work_group_days,
       d.name AS department_name
     FROM users u
     LEFT JOIN work_groups wg ON wg.id = u.work_group_id
     LEFT JOIN departments d ON d.id = u.department_id
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


function normalizeRuleValue(value) {
  const text = String(value || '').trim();
  return text || 'all';
}

function isRuleMatch(rule, { user, recordType, workDayType, weekDayName, currentMinutes }) {
  const departmentId = rule.department_id ? Number(rule.department_id) : null;
  if (departmentId && Number(user.department_id || 0) !== departmentId) return false;

  if (normalizeRuleValue(rule.week_day) !== 'all' && normalizeRuleValue(rule.week_day) !== weekDayName) return false;
  if (normalizeRuleValue(rule.record_type) !== 'all' && normalizeRuleValue(rule.record_type) !== recordType) return false;
  if (normalizeRuleValue(rule.work_day_type) !== 'all' && normalizeRuleValue(rule.work_day_type) !== workDayType) return false;

  const from = String(rule.time_from || '').trim();
  const to = String(rule.time_to || '').trim();
  if (from && currentMinutes < getTimeMinutes(from)) return false;
  if (to && currentMinutes > getTimeMinutes(to)) return false;

  return true;
}

async function evaluateSystemRules() {
  return {
    blocked: false,
    blockedMessage: '',
    requiresApproval: false,
    exceptionReason: '',
    messages: [],
    matchedRules: []
  };
}

async function validateAttendanceRequest({ user, recordType, workDayType, recordDateString = '', recordMinutes = null }) {
  const now = getNowInIsrael();
  const dateString = recordDateString || now.dateString;
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
    const currentMinutes = getCurrentTimeMinutes(recordMinutes);
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

  const rulesValidation = await evaluateSystemRules({
    user,
    recordType,
    workDayType,
    weekDayName,
    currentMinutes: recordMinutes
  });

  if (rulesValidation.blocked) {
    return {
      settings,
      holidayName: holiday ? holiday.holiday_name : '',
      blocked: true,
      blockedMessage: rulesValidation.blockedMessage,
      requiresAdminApproval: false,
      approvalStatus: 'blocked',
      exceptionReason: rulesValidation.blockedMessage,
      message: rulesValidation.blockedMessage,
      matchedRules: rulesValidation.matchedRules
    };
  }

  if (rulesValidation.requiresApproval) {
    requiresAdminApproval = true;
    approvalStatus = 'pending';
    exceptionReason = exceptionReason || rulesValidation.exceptionReason;
  }

  messages.push(...rulesValidation.messages);

  return {
    settings,
    holidayName: holiday ? holiday.holiday_name : '',
    blocked: false,
    requiresAdminApproval,
    approvalStatus,
    exceptionReason,
    message: messages.join(' | '),
    matchedRules: rulesValidation.matchedRules
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

function hasRole(userRole, minimumRole) {
  return (ROLE_RANKS[userRole] || 0) >= (ROLE_RANKS[minimumRole] || 999);
}

function roleRequired(minimumRole) {
  return (req, res, next) => {
    if (!hasRole(req.user?.role, minimumRole)) {
      return res.status(403).json({ error: 'אין הרשאה מתאימה לפעולה זו' });
    }
    next();
  };
}

function adminRequired(req, res, next) {
  return roleRequired('admin')(req, res, next);
}

function managerRequired(req, res, next) {
  return roleRequired('work_manager')(req, res, next);
}

function normalizeRole(value) {
  const role = String(value || 'employee').trim();
  return ALLOWED_ROLES.includes(role) ? role : 'employee';
}

async function getVisibleUserIds(req) {
  if (req.user?.role === 'admin') return null;

  if (req.user?.role === 'work_manager') {
    const managerRes = await query(
      `SELECT department_id FROM users WHERE id = $1 LIMIT 1`,
      [req.user.id]
    );
    const departmentId = managerRes.rows[0]?.department_id || null;

    if (!departmentId) return [req.user.id];

    const usersRes = await query(
      `SELECT id
       FROM users
       WHERE id = $1
          OR (department_id = $2 AND COALESCE(role, 'employee') <> 'admin')
       ORDER BY full_name ASC`,
      [req.user.id, departmentId]
    );
    return usersRes.rows.map((row) => row.id);
  }

  return [req.user.id];
}

function scopedAnyCondition(userIds, columnName, paramIndex) {
  return userIds === null ? '1=1' : `${columnName} = ANY($${paramIndex}::int[])`;
}


async function getRequesterDepartmentId(req) {
  if (!req.user?.id) return null;
  const result = await query(`SELECT department_id FROM users WHERE id = $1 LIMIT 1`, [req.user.id]);
  return result.rows[0]?.department_id || null;
}

async function canAccessTargetUser(req, targetUserId) {
  const id = parseInt(targetUserId, 10);
  if (!id) return false;
  if (req.user?.role === 'admin') return true;
  if (Number(req.user?.id) === id) return true;
  if (req.user?.role !== 'work_manager') return false;

  const managerDepartmentId = await getRequesterDepartmentId(req);
  if (!managerDepartmentId) return false;

  const result = await query(
    `SELECT id
     FROM users
     WHERE id = $1
       AND department_id = $2
       AND COALESCE(role, 'employee') <> 'admin'
     LIMIT 1`,
    [id, managerDepartmentId]
  );
  return Boolean(result.rows[0]);
}

async function getScopedAttendanceRecord(req, recordId) {
  const result = await query(
    `SELECT ar.*, u.department_id
     FROM attendance_records ar
     JOIN users u ON u.id = ar.user_id
     WHERE ar.id = $1
     LIMIT 1`,
    [recordId]
  );
  const record = result.rows[0];
  if (!record) return null;
  if (await canAccessTargetUser(req, record.user_id)) return record;
  return false;
}

function requiresDepartmentForRole(role) {
  return role === 'employee' || role === 'work_manager';
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

app.get('/api/roles', authRequired, (req, res) => {
  res.json(ALLOWED_ROLES.map((value) => ({ value, label: ROLE_LABELS[value], rank: ROLE_RANKS[value] })));
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
         record_time,
         created_at
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
      { header: 'Manual/Reported Time', key: 'record_time', width: 25 },
      { header: 'Action Timestamp', key: 'created_at', width: 25 }
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

    let {
      recordType,
      workDayType,
      note,
      latitude,
      longitude,
      location_status,
      meal_type,
      recordDateTime
    } = req.body;

    latitude = latitude || '';
    longitude = longitude || '';
    location_status = location_status || 'denied';

    if (!['in', 'out'].includes(recordType)) {
      return res.status(400).json({ error: 'סוג דיווח לא תקין' });
    }

    if (!workDayType) {
      return res.status(400).json({ error: 'יש לבחור סוג יום עבודה' });
    }

    const resolvedRecordTime = resolveRecordDateTime(recordDateTime);
    if (resolvedRecordTime.error) {
      return res.status(400).json({ error: resolvedRecordTime.error });
    }

    const monthKey = getMonthKeyFromDateValue(resolvedRecordTime.date);
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
      workDayType,
      recordDateString: resolvedRecordTime.dateString,
      recordMinutes: resolvedRecordTime.minutes
    });

    if (validation.blocked) {
      return res.status(403).json({ error: validation.blockedMessage || validation.message || 'הפעולה נחסמה לפי חוק מערכת' });
    }

    const normalizedMealType = normalizeMealType(meal_type);
    const mealCity = normalizedMealType && location_status === 'ok'
      ? await getNearestCityFromCoords(latitude, longitude)
      : '';

    const todayDate = resolvedRecordTime.dateString;
    const lastRecordDate = lastRecord?.record_time ? getDateStringFromValue(lastRecord.record_time) : '';
    const isClosedFromPreviousDay =
      Number(user.day_closed || 0) === 1 &&
      lastRecordDate &&
      lastRecordDate !== todayDate;

    if (isClosedFromPreviousDay) {
      await query(
        `UPDATE users
         SET day_closed = 0
         WHERE id = $1`,
        [req.user.id]
      );
      user.day_closed = 0;
    }

    if (recordType === 'in' && user.day_closed) {
      return res.status(400).json({ error: 'היום נסגר. יש לפנות למנהל לאישור פתיחה מחדש' });
    }

    if (
      recordType === 'in' &&
      validation.settings.prevent_double_checkin &&
      lastRecord &&
      lastRecord.record_type === 'in' &&
      lastRecordDate === todayDate
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
         action_label,
         meal_type,
         meal_city,
         meal_latitude,
         meal_longitude
       )
       VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,
         $21,NOW(),
         $10,$11,$12,$13,$14,$15,$16,
         $17,$18,$19,$20
       )
       RETURNING *`,
      [
        req.user.id,
        recordType,
        workDayType,
        note || '',
        latitude,
        longitude,
        location_status,
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
        normalizedMealType ? latitude : '',
        normalizedMealType ? longitude : '',
        resolvedRecordTime.sql
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
        `הזמן שהוזן ידנית: ${resolvedRecordTime.sql}`,
        `חותמת זמן ביצוע הפעולה: ${new Date().toISOString()}`,
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
    console.error('ATTENDANCE ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});


app.post('/api/nfc/attendance', async (req, res) => {
  try {
    const uid = normalizeNfcUid(req.body.uid || req.body.card_uid || req.body.cardUid);

    if (!uid) {
      return res.status(400).json({ error: 'חסר UID של כרטיס' });
    }

    const userRes = await query(
      `SELECT *
       FROM users
       WHERE nfc_uid = $1
       LIMIT 1`,
      [uid]
    );

    const user = userRes.rows[0];

    if (!user || !Number(user.is_active || 0)) {
      return res.status(404).json({ error: 'כרטיס לא משויך לעובד פעיל', uid });
    }

    const scheduledUser = await resolveUserSchedule(user.id);
    const todayDate = getNowInIsrael().dateString;

    const lastRes = await query(
      `SELECT *
       FROM attendance_records
       WHERE user_id = $1
       ORDER BY record_time DESC, id DESC
       LIMIT 1`,
      [user.id]
    );

    const lastRecord = lastRes.rows[0] || null;
    const lastRecordDate = lastRecord?.record_time ? getDateStringFromValue(lastRecord.record_time) : '';
    const nextRecordType = lastRecord && lastRecord.record_type === 'in' && lastRecordDate === todayDate ? 'out' : 'in';
    const workDayType = nextRecordType === 'out' && lastRecord?.work_day_type ? lastRecord.work_day_type : 'יום רגיל';

    if (nextRecordType === 'in' && Number(user.day_closed || 0) === 1) {
      await query(
        `UPDATE users
         SET day_closed = 0
         WHERE id = $1`,
        [user.id]
      );
    }

    const validation = await validateAttendanceRequest({
      user: scheduledUser || user,
      recordType: nextRecordType,
      workDayType
    });

    if (validation.blocked) {
      return res.status(403).json({ error: validation.blockedMessage || validation.message || 'הפעולה נחסמה לפי חוק מערכת', uid });
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
         meal_type,
         meal_city,
         meal_latitude,
         meal_longitude
       )
       VALUES (
         $1,$2,$3,$4,'','','ok',$5,$6,
         NOW(),NOW(),
         $7,$8,$9,'',0,'nfc_card',$10,'','','',''
       )
       RETURNING *`,
      [
        user.id,
        nextRecordType,
        workDayType,
        'דיווח באמצעות כרטיס',
        req.ip || '',
        req.headers['user-agent'] || 'NFC Reader',
        validation.approvalStatus,
        validation.requiresAdminApproval ? 1 : 0,
        validation.exceptionReason,
        buildActionTitle(nextRecordType, workDayType)
      ]
    );

    await query(
      `UPDATE users
       SET day_closed = $1
       WHERE id = $2`,
      [nextRecordType === 'out' ? 1 : 0, user.id]
    );

    await logAction({
      userId: user.id,
      attendanceRecordId: inserted.rows[0].id,
      actionType: 'attendance_nfc',
      actionTitle: buildActionTitle(nextRecordType, workDayType),
      details: [
        `דיווח כרטיס UID: ${uid}`,
        `סוג יום: ${workDayType}`,
        validation.exceptionReason ? `חריגה: ${validation.exceptionReason}` : '',
        validation.requiresAdminApproval ? 'ממתין לאישור מנהל' : 'אושר אוטומטית'
      ].filter(Boolean).join(' | '),
      createdByUserId: null
    });

    res.json({
      success: true,
      uid,
      user_id: user.id,
      employee_code: user.employee_code,
      full_name: user.full_name,
      record_type: nextRecordType,
      status: nextRecordType,
      action_label: buildActionTitle(nextRecordType, workDayType),
      record_time: inserted.rows[0].record_time,
      approval_status: inserted.rows[0].approval_status,
      requires_admin_approval: inserted.rows[0].requires_admin_approval,
      exception_reason: inserted.rows[0].exception_reason,
      message: nextRecordType === 'in' ? 'כניסה נרשמה בהצלחה' : 'יציאה נרשמה בהצלחה'
    });
  } catch (err) {
    if (String(err.message || '').includes('users_nfc_uid_unique')) {
      return res.status(400).json({ error: 'כרטיס זה כבר משויך לעובד אחר' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/dashboard', authRequired, managerRequired, async (req, res) => {
  try {
    await ensureMonthlyLock();
    await ensureAutoCloseSpecialRecords();

    const today = String(req.query.date || '').trim() || getNowInIsrael().dateString;
    const userIds = await getVisibleUserIds(req);
    const scopeCondition = scopedAnyCondition(userIds, 'u.id', 2);
    const params = userIds === null ? [today] : [today, userIds];

    const result = await query(
      `WITH last_today AS (
         SELECT DISTINCT ON (ar.user_id)
           ar.user_id,
           ar.record_type,
           ar.record_time,
           ar.created_at,
           ar.work_day_type,
           ar.approval_status
         FROM attendance_records ar
         WHERE DATE(ar.record_time) = $1::date
         ORDER BY ar.user_id, ar.record_time DESC, ar.id DESC
       )
       SELECT
         u.id,
         u.employee_code,
         u.full_name,
         u.role,
         u.department_id,
         d.name AS department_name,
         lt.record_type,
         lt.record_time,
         lt.created_at,
         lt.work_day_type,
         lt.approval_status
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       LEFT JOIN last_today lt ON lt.user_id = u.id
       WHERE COALESCE(u.is_active, 1) = 1
         AND COALESCE(u.role, 'employee') <> 'admin'
         AND ${scopeCondition}
       ORDER BY u.full_name ASC`,
      params
    );

    const active = [];
    const inactive = [];

    for (const row of result.rows) {
      const item = {
        id: row.id,
        employee_code: row.employee_code,
        full_name: row.full_name,
        role: row.role,
        department_id: row.department_id,
        department_name: row.department_name || '-',
        last_record_type: row.record_type || '',
        last_record_time: row.record_time || '',
        last_action_time: row.created_at || '',
        work_day_type: row.work_day_type || '',
        approval_status: row.approval_status || ''
      };

      if (row.record_type === 'in') active.push(item);
      else inactive.push(item);
    }

    res.json({ date: today, active, inactive });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/reports', authRequired, managerRequired, async (req, res) => {
  try {
    await ensureMonthlyLock();
    await ensureAutoCloseSpecialRecords();

    const { employeeCode = '', fromDate = '', toDate = '', approvalStatus = '' } = req.query;

    const userIds = await getVisibleUserIds(req);
    const scopeCondition = scopedAnyCondition(userIds, 'ar.user_id', 5);

    const result = await query(
      `SELECT
         ar.*,
         u.employee_code,
         u.full_name,
         u.department_id
       FROM attendance_records ar
       JOIN users u ON u.id = ar.user_id
       WHERE ($1 = '' OR u.employee_code ILIKE '%' || $1 || '%' OR u.full_name ILIKE '%' || $1 || '%')
         AND ($2 = '' OR DATE(ar.record_time) >= $2::date)
         AND ($3 = '' OR DATE(ar.record_time) <= $3::date)
         AND ($4 = '' OR ar.approval_status = $4)
         AND ${scopeCondition}
       ORDER BY ar.record_time DESC, ar.id DESC`,
      userIds === null ? [employeeCode, fromDate, toDate, approvalStatus] : [employeeCode, fromDate, toDate, approvalStatus, userIds]
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



app.post('/api/admin/reports/manual', authRequired, managerRequired, async (req, res) => {
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
      `SELECT id, full_name, employee_code, is_active, department_id
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

    if (!(await canAccessTargetUser(req, user.id))) {
      return res.status(403).json({ error: 'אין הרשאה לבצע פעולה על עובד מחוץ למחלקה שלך' });
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

app.get('/api/admin/action-logs', authRequired, managerRequired, async (req, res) => {
  try {
    const { employeeCode = '', fromDate = '', toDate = '' } = req.query;
    const userIds = await getVisibleUserIds(req);
    const scopeCondition = scopedAnyCondition(userIds, 'al.user_id', 4);

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
         AND ${scopeCondition}
       ORDER BY al.created_at DESC, al.id DESC`,
      userIds === null ? [employeeCode, fromDate, toDate] : [employeeCode, fromDate, toDate, userIds]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/reports/:id', authRequired, managerRequired, async (req, res) => {
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

    const current = await getScopedAttendanceRecord(req, id);

    if (current === false) {
      return res.status(403).json({ error: 'אין הרשאה לערוך דיווח מחוץ למחלקה שלך' });
    }

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

app.put('/api/admin/reports/:id/approval', authRequired, managerRequired, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const approvalStatus = ['approved', 'rejected', 'pending'].includes(req.body.approval_status)
      ? req.body.approval_status
      : 'approved';
    const managerNote = String(req.body.manager_note || '').trim();

    const current = await getScopedAttendanceRecord(req, id);
    if (current === false) {
      return res.status(403).json({ error: 'אין הרשאה לאשר דיווח מחוץ למחלקה שלך' });
    }
    if (!current) {
      return res.status(404).json({ error: 'הרשומה לא נמצאה' });
    }

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

app.delete('/api/admin/reports/:id', authRequired, managerRequired, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    const record = await getScopedAttendanceRecord(req, id);
    if (record === false) {
      return res.status(403).json({ error: 'אין הרשאה למחוק דיווח מחוץ למחלקה שלך' });
    }
    if (!record) {
      return res.status(404).json({ error: 'הרשומה לא נמצאה' });
    }

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

app.post('/api/admin/reports/delete-many', authRequired, managerRequired, async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(v => parseInt(v, 10)).filter(Boolean) : [];

    if (!ids.length) {
      return res.status(400).json({ error: 'לא נבחרו שורות למחיקה' });
    }

    const userIds = await getVisibleUserIds(req);
    const scopeCondition = scopedAnyCondition(userIds, 'ar.user_id', 2);
    const visible = await query(
      `SELECT ar.id
       FROM attendance_records ar
       WHERE ar.id = ANY($1::int[])
         AND ${scopeCondition}`,
      userIds === null ? [ids] : [ids, userIds]
    );

    if (visible.rows.length !== ids.length) {
      return res.status(403).json({ error: 'חלק מהדיווחים שנבחרו אינם שייכים למחלקה שלך' });
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

app.post('/api/admin/reports/delete-filtered', authRequired, managerRequired, async (req, res) => {
  try {
    const {
      employeeCode = '',
      fromDate = '',
      toDate = ''
    } = req.body || {};

    const userIds = await getVisibleUserIds(req);
    const scopeCondition = scopedAnyCondition(userIds, 'ar.user_id', 4);

    await query(
      `DELETE FROM attendance_records ar
       USING users u
       WHERE u.id = ar.user_id
         AND ($1 = '' OR u.employee_code ILIKE '%' || $1 || '%' OR u.full_name ILIKE '%' || $1 || '%')
         AND ($2 = '' OR DATE(ar.record_time) >= $2::date)
         AND ($3 = '' OR DATE(ar.record_time) <= $3::date)
         AND ${scopeCondition}`,
      userIds === null ? [employeeCode, fromDate, toDate] : [employeeCode, fromDate, toDate, userIds]
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

app.get('/api/admin/monthly-summary', authRequired, managerRequired, async (req, res) => {
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

    const userIds = await getVisibleUserIds(req);
    const scopeCondition = scopedAnyCondition(userIds, 'ar.user_id', 2);

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
         AND ${scopeCondition}
       GROUP BY u.employee_code, u.full_name, DATE(ar.record_time)
       ORDER BY work_date DESC, u.full_name ASC`,
      userIds === null ? [month] : [month, userIds]
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

app.get('/api/admin/users', authRequired, managerRequired, async (req, res) => {
  try {
    const userIds = await getVisibleUserIds(req);
    const scopeCondition = scopedAnyCondition(userIds, 'u.id', 1);

    const result = await query(
      `SELECT
         u.id,
         u.employee_code,
         u.full_name,
         u.role,
         u.is_active,
         u.day_closed,
         u.nfc_uid,
         u.created_at,
         u.work_group_id,
         u.allowed_work_days,
         u.friday_rotation_anchor_date,
         u.friday_rotation_start_allowed,
         u.department_id,
         d.name AS department_name,
         wg.name AS work_group_name,
         wg.work_days AS work_group_days
       FROM users u
       LEFT JOIN work_groups wg ON wg.id = u.work_group_id
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE ${scopeCondition}
       ORDER BY u.employee_code ASC`,
      userIds === null ? [] : [userIds]
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

app.post('/api/admin/users', authRequired, managerRequired, async (req, res) => {
  try {
    const {
      employee_code,
      full_name,
      password,
      role,
      is_active,
      nfc_uid,
      work_group_id,
      allowed_work_days,
      friday_rotation_anchor_date,
      friday_rotation_start_allowed,
      department_id
    } = req.body;

    let nextRole = normalizeRole(role);
    let nextDepartmentId = department_id ? parseInt(department_id, 10) : null;

    if (req.user.role === 'work_manager') {
      const managerDepartmentId = await getRequesterDepartmentId(req);
      if (!managerDepartmentId) {
        return res.status(403).json({ error: 'לא ניתן להוסיף עובד ללא מחלקה למנהל העבודה' });
      }
      nextRole = 'employee';
      nextDepartmentId = managerDepartmentId;
    }

    if (!employee_code || !full_name || !password) {
      return res.status(400).json({ error: 'יש למלא קוד, שם וסיסמה' });
    }

    if (requiresDepartmentForRole(nextRole) && !nextDepartmentId) {
      return res.status(400).json({ error: 'חובה לשייך עובד או מנהל עבודה למחלקה' });
    }

    const exists = await query(
      `SELECT id FROM users WHERE employee_code = $1`,
      [String(employee_code)]
    );

    if (exists.rows.length > 0) {
      return res.status(400).json({ error: 'קוד עובד כבר קיים' });
    }

    const nextNfcUid = normalizeNfcUid(nfc_uid);
    if (nextNfcUid) {
      const nfcExists = await query(
        `SELECT id FROM users WHERE nfc_uid = $1`,
        [nextNfcUid]
      );
      if (nfcExists.rows.length > 0) {
        return res.status(400).json({ error: 'כרטיס זה כבר משויך לעובד אחר' });
      }
    }

    await query(
      `INSERT INTO users (
         employee_code,
         full_name,
         password_hash,
         role,
         is_active,
         day_closed,
         nfc_uid,
         created_at,
         work_group_id,
         allowed_work_days,
         friday_rotation_anchor_date,
         friday_rotation_start_allowed,
         department_id
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8,$9,$10,$11,$12)`,
      [
        String(employee_code),
        String(full_name),
        bcrypt.hashSync(String(password), 10),
        nextRole,
        is_active ? 1 : 0,
        0,
        nextNfcUid,
        work_group_id ? parseInt(work_group_id, 10) : null,
        JSON.stringify(normalizeWeekDays(allowed_work_days)),
        friday_rotation_anchor_date || getNowInIsrael().dateString,
        friday_rotation_start_allowed ? 1 : 0,
        nextDepartmentId
      ]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/users/:id', authRequired, managerRequired, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const {
      employee_code,
      full_name,
      password,
      role,
      is_active,
      day_closed,
      nfc_uid,
      work_group_id,
      allowed_work_days,
      friday_rotation_anchor_date,
      friday_rotation_start_allowed,
      department_id
    } = req.body;

    const userRes = await query(
      `SELECT * FROM users WHERE id = $1`,
      [id]
    );
    const user = userRes.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }

    if (req.user.role === 'work_manager') {
      if (!(await canAccessTargetUser(req, id))) {
        return res.status(403).json({ error: 'אין הרשאה לערוך עובד מחוץ למחלקה שלך' });
      }
      if (user.role === 'admin') {
        return res.status(403).json({ error: 'אין הרשאה לערוך מנהל מערכת' });
      }
    }

    const nextEmployeeCode = typeof employee_code !== 'undefined' ? String(employee_code).trim() : user.employee_code;
    const nextName = typeof full_name !== 'undefined' ? String(full_name) : user.full_name;
    const nextRole = typeof role !== 'undefined' ? normalizeRole(role) : user.role;
    const nextActive = typeof is_active !== 'undefined' ? (is_active ? 1 : 0) : user.is_active;
    const nextClosed = typeof day_closed !== 'undefined' ? (day_closed ? 1 : 0) : user.day_closed;
    const nextNfcUid = typeof nfc_uid !== 'undefined' ? normalizeNfcUid(nfc_uid) : (user.nfc_uid || '');
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
    let nextDepartmentId = typeof department_id !== 'undefined'
      ? (department_id ? parseInt(department_id, 10) : null)
      : user.department_id;

    let finalRole = nextRole;
    if (req.user.role === 'work_manager') {
      const managerDepartmentId = await getRequesterDepartmentId(req);
      if (!managerDepartmentId) {
        return res.status(403).json({ error: 'לא ניתן לערוך ללא מחלקה למנהל העבודה' });
      }
      finalRole = user.role === 'work_manager' ? 'work_manager' : 'employee';
      nextDepartmentId = managerDepartmentId;
    }

    if (requiresDepartmentForRole(finalRole) && !nextDepartmentId) {
      return res.status(400).json({ error: 'חובה לשייך עובד או מנהל עבודה למחלקה' });
    }

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

    if (nextNfcUid) {
      const nfcExists = await query(
        `SELECT id FROM users WHERE nfc_uid = $1 AND id <> $2`,
        [nextNfcUid, id]
      );
      if (nfcExists.rows.length > 0) {
        return res.status(400).json({ error: 'כרטיס זה כבר משויך לעובד אחר' });
      }
    }

    await query(
      `UPDATE users
       SET employee_code = $1,
           full_name = $2,
           password_hash = $3,
           role = $4,
           is_active = $5,
           day_closed = $6,
           nfc_uid = $7,
           work_group_id = $8,
           allowed_work_days = $9,
           friday_rotation_anchor_date = $10,
           friday_rotation_start_allowed = $11,
           department_id = $12
       WHERE id = $13`,
      [
        nextEmployeeCode,
        nextName,
        nextPasswordHash,
        finalRole,
        nextActive,
        nextClosed,
        nextNfcUid,
        nextWorkGroupId,
        nextAllowedWorkDays,
        nextFridayAnchorDate,
        nextFridayStartAllowed,
        nextDepartmentId,
        id
      ]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/users/:id/reopen-day', authRequired, managerRequired, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (!(await canAccessTargetUser(req, id))) {
      return res.status(403).json({ error: 'אין הרשאה לשחרר עובד מחוץ למחלקה שלך' });
    }

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

app.put('/api/admin/users/:id/work-schedule', authRequired, managerRequired, async (req, res) => {
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

    if (!(await canAccessTargetUser(req, id))) {
      return res.status(403).json({ error: 'אין הרשאה לעדכן עובד מחוץ למחלקה שלך' });
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

app.delete('/api/admin/users/:id', authRequired, managerRequired, async (req, res) => {
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

    if (req.user.role === 'work_manager') {
      if (Number(req.user.id) === id) {
        return res.status(400).json({ error: 'מנהל עבודה לא יכול למחוק את עצמו' });
      }
      if (!(await canAccessTargetUser(req, id))) {
        return res.status(403).json({ error: 'אין הרשאה למחוק עובד מחוץ למחלקה שלך' });
      }
      if (user.role === 'admin') {
        return res.status(403).json({ error: 'אין הרשאה למחוק מנהל מערכת' });
      }
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

app.use('/api/admin/departments', authRequired, managerRequired, require('./routes/departments'));

app.get('/api/admin/rules', authRequired, adminRequired, async (req, res) => {
  res.json([]);
});

app.post('/api/admin/rules', authRequired, adminRequired, async (req, res) => {
  res.status(410).json({ error: 'חוקי מערכת הוסרו מהמערכת' });
});

app.put('/api/admin/rules/:id', authRequired, adminRequired, async (req, res) => {
  res.status(410).json({ error: 'חוקי מערכת הוסרו מהמערכת' });
});

app.delete('/api/admin/rules/:id', authRequired, adminRequired, async (req, res) => {
  res.status(410).json({ error: 'חוקי מערכת הוסרו מהמערכת' });
});


app.get('/api/admin/export', authRequired, managerRequired, async (req, res) => {
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
         ar.record_time,
         ar.created_at
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
      { header: 'Manual/Reported Time', key: 'record_time', width: 25 },
      { header: 'Action Timestamp', key: 'created_at', width: 25 }
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

app.get('/api/admin/dashboard-stats', authRequired, managerRequired, async (req, res) => {
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
