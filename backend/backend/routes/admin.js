const express = require('express');
const ExcelJS = require('exceljs');
const { all, get, run } = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken, requireAdmin);

function buildFilters(query) {
  const conditions = [];
  const params = [];

  if (query.employeeCode) {
    conditions.push('u.employee_code LIKE ?');
    params.push(`%${query.employeeCode}%`);
  }

  if (query.fullName) {
    conditions.push('u.full_name LIKE ?');
    params.push(`%${query.fullName}%`);
  }

  if (query.dateFrom) {
    conditions.push('date(ar.record_time) >= date(?)');
    params.push(query.dateFrom);
  }

  if (query.dateTo) {
    conditions.push('date(ar.record_time) <= date(?)');
    params.push(query.dateTo);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, params };
}

function groupDailyTotals(rows) {
  const map = new Map();

  const sortedRows = [...rows].sort((a, b) => new Date(a.record_time) - new Date(b.record_time));

  for (const row of sortedRows) {
    const day = row.record_time.slice(0, 10);
    const key = `${row.user_id}_${day}`;

    if (!map.has(key)) {
      map.set(key, {
        userId: row.user_id,
        employeeCode: row.employee_code,
        fullName: row.full_name,
        date: day,
        firstIn: null,
        lastOut: null,
        totalMinutes: 0,
        openCheckIn: null,
      });
    }

    const item = map.get(key);
    const currentTime = new Date(row.record_time);

    if (row.record_type === 'in') {
      if (!item.firstIn) item.firstIn = row.record_time;
      item.openCheckIn = currentTime;
    }

    if (row.record_type === 'out') {
      item.lastOut = row.record_time;
      if (item.openCheckIn) {
        const diffMs = currentTime - item.openCheckIn;
        if (diffMs > 0) {
          item.totalMinutes += Math.round(diffMs / 60000);
        }
        item.openCheckIn = null;
      }
    }
  }

  return Array.from(map.values()).map((item) => ({
    ...item,
    totalHours: Number((item.totalMinutes / 60).toFixed(2)),
  }));
}

router.get('/reports', async (req, res) => {
  try {
    const { whereClause, params } = buildFilters(req.query);
    const rows = await all(
      `SELECT ar.*, u.employee_code, u.full_name
       FROM attendance_records ar
       JOIN users u ON u.id = ar.user_id
       ${whereClause}
       ORDER BY ar.record_time DESC`,
      params
    );

    res.json(rows);
  } catch (error) {
    console.error('LOAD ADMIN REPORTS ERROR:', error);
    res.status(500).json({ message: 'Failed to load reports' });
  }
});

router.get('/monthly-report', async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) {
      return res.status(400).json({ message: 'Month is required in format YYYY-MM' });
    }

    const rows = await all(
      `SELECT ar.*, u.employee_code, u.full_name
       FROM attendance_records ar
       JOIN users u ON u.id = ar.user_id
       WHERE strftime('%Y-%m', ar.record_time) = ?
       ORDER BY ar.record_time ASC`,
      [month]
    );

    const daily = groupDailyTotals(rows);
    res.json(daily);
  } catch (error) {
    console.error('MONTHLY REPORT ERROR:', error);
    res.status(500).json({ message: 'Failed to load monthly report' });
  }
});

router.get('/dashboard', async (req, res) => {
  try {
    const totalUsersRow = await get('SELECT COUNT(*) as total FROM users WHERE is_active = 1');
    const todayRecordsRow = await get(
      `SELECT COUNT(*) as total
       FROM attendance_records
       WHERE date(record_time) = date('now', 'localtime')`
    );
    const openSessionsRow = await get(
      `SELECT COUNT(*) as total FROM (
         SELECT user_id, MAX(id) as max_id
         FROM attendance_records
         GROUP BY user_id
       ) latest
       JOIN attendance_records ar ON ar.id = latest.max_id
       WHERE ar.record_type = 'in'`
    );

    const recentRecords = await all(
      `SELECT ar.*, u.employee_code, u.full_name
       FROM attendance_records ar
       JOIN users u ON u.id = ar.user_id
       ORDER BY ar.record_time DESC
       LIMIT 10`
    );

    res.json({
      totalActiveUsers: totalUsersRow?.total || 0,
      todayRecords: todayRecordsRow?.total || 0,
      currentlyCheckedIn: openSessionsRow?.total || 0,
      recentRecords,
    });
  } catch (error) {
    console.error('DASHBOARD ERROR:', error);
    res.status(500).json({ message: 'Failed to load dashboard' });
  }
});

router.get('/settings', async (req, res) => {
  try {
    const settings = await get('SELECT * FROM settings WHERE id = 1');
    res.json(settings);
  } catch (error) {
    console.error('LOAD SETTINGS ERROR:', error);
    res.status(500).json({ message: 'Failed to load settings' });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const {
      preventDoubleCheckin,
      preventCheckoutWithoutCheckin,
      allowMultipleSessionsPerDay,
    } = req.body;

    await run(
      `UPDATE settings
       SET prevent_double_checkin = ?,
           prevent_checkout_without_checkin = ?,
           allow_multiple_sessions_per_day = ?
       WHERE id = 1`,
      [
        preventDoubleCheckin ? 1 : 0,
        preventCheckoutWithoutCheckin ? 1 : 0,
        allowMultipleSessionsPerDay ? 1 : 0,
      ]
    );

    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    console.error('SAVE SETTINGS ERROR:', error);
    res.status(500).json({ message: 'Failed to save settings' });
  }
});

router.get('/export/excel', async (req, res) => {
  try {
    const { whereClause, params } = buildFilters(req.query);
    const rows = await all(
      `SELECT ar.record_time, ar.record_type, ar.work_day_type, ar.note, u.employee_code, u.full_name
       FROM attendance_records ar
       JOIN users u ON u.id = ar.user_id
       ${whereClause}
       ORDER BY ar.record_time DESC`,
      params
    );

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance');

    worksheet.columns = [
      { header: 'Employee Code', key: 'employee_code', width: 16 },
      { header: 'Full Name', key: 'full_name', width: 24 },
      { header: 'Record Type', key: 'record_type', width: 14 },
      { header: 'Work Day Type', key: 'work_day_type', width: 18 },
      { header: 'Note', key: 'note', width: 30 },
      { header: 'Record Time', key: 'record_time', width: 24 },
    ];

    rows.forEach((row) => worksheet.addRow(row));
    worksheet.getRow(1).font = { bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=vclock-attendance.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('EXPORT EXCEL ERROR:', error);
    res.status(500).json({ message: 'Failed to export Excel file' });
  }
});

module.exports = router;
