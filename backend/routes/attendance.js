const express = require('express');
const { all, get, run } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

function buildDateRange(dateFrom, dateTo) {
  let where = ' WHERE ar.user_id = ? ';
  const params = [];

  if (dateFrom) {
    where += ' AND date(ar.record_time) >= date(?) ';
    params.push(dateFrom);
  }

  if (dateTo) {
    where += ' AND date(ar.record_time) <= date(?) ';
    params.push(dateTo);
  }

  return { where, params };
}

router.get('/my-records', authenticateToken, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const { where, params } = buildDateRange(dateFrom, dateTo);
    const rows = await all(
      `SELECT ar.*, u.full_name, u.employee_code
       FROM attendance_records ar
       JOIN users u ON u.id = ar.user_id
       ${where}
       ORDER BY ar.record_time DESC`,
      [req.user.id, ...params]
    );

    res.json(rows);
  } catch (error) {
    console.error('LOAD MY RECORDS ERROR:', error);
    res.status(500).json({ message: 'Failed to load attendance records' });
  }
});

router.get('/status', authenticateToken, async (req, res) => {
  try {
    const settings = await get('SELECT * FROM settings WHERE id = 1');
    const lastRecord = await get(
      `SELECT * FROM attendance_records
       WHERE user_id = ?
       ORDER BY record_time DESC, id DESC
       LIMIT 1`,
      [req.user.id]
    );

    res.json({
      lastRecord,
      settings,
      isCheckedIn: lastRecord?.record_type === 'in',
    });
  } catch (error) {
    console.error('STATUS ERROR:', error);
    res.status(500).json({ message: 'Failed to load current status' });
  }
});

router.post('/record', authenticateToken, async (req, res) => {
  try {
    const { recordType, workDayType, note } = req.body;
    if (!['in', 'out'].includes(recordType)) {
      return res.status(400).json({ message: 'Invalid record type' });
    }

    if (!workDayType) {
      return res.status(400).json({ message: 'Work day type is required' });
    }

    const settings = await get('SELECT * FROM settings WHERE id = 1');
    const lastRecord = await get(
      `SELECT * FROM attendance_records
       WHERE user_id = ?
       ORDER BY record_time DESC, id DESC
       LIMIT 1`,
      [req.user.id]
    );

    if (recordType === 'in' && settings.prevent_double_checkin && lastRecord?.record_type === 'in') {
      return res.status(400).json({ message: 'Cannot check in twice without check out' });
    }

    if (recordType === 'out' && settings.prevent_checkout_without_checkin && lastRecord?.record_type !== 'in') {
      return res.status(400).json({ message: 'Cannot check out before check in' });
    }

    const now = new Date().toISOString();

    await run(
      `INSERT INTO attendance_records (user_id, record_type, work_day_type, note, record_time)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, recordType, workDayType, note || '', now]
    );

    const latestRecord = await get(
      `SELECT * FROM attendance_records
       WHERE user_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [req.user.id]
    );

    res.json({ message: 'Record saved successfully', record: latestRecord });
  } catch (error) {
    console.error('SAVE RECORD ERROR:', error);
    res.status(500).json({ message: 'Failed to save attendance record' });
  }
});

module.exports = router;
