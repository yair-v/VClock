const express = require('express');
const router = express.Router();
const { query } = require('../db');

router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT *
       FROM departments
       ORDER BY name ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const description = String(req.body.description || '').trim();
    const isActive = typeof req.body.is_active !== 'undefined' ? (req.body.is_active ? 1 : 0) : 1;

    if (!name) {
      return res.status(400).json({ error: 'יש להזין שם מחלקה' });
    }

    await query(
      `INSERT INTO departments (name, description, is_active, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [name, description, isActive]
    );

    res.json({ success: true });
  } catch (err) {
    if (String(err.message || '').includes('duplicate key')) {
      return res.status(400).json({ error: 'שם המחלקה כבר קיים' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const name = String(req.body.name || '').trim();
    const description = String(req.body.description || '').trim();
    const isActive = req.body.is_active ? 1 : 0;

    if (!name) {
      return res.status(400).json({ error: 'יש להזין שם מחלקה' });
    }

    await query(
      `UPDATE departments
       SET name = $1,
           description = $2,
           is_active = $3
       WHERE id = $4`,
      [name, description, isActive, id]
    );

    res.json({ success: true });
  } catch (err) {
    if (String(err.message || '').includes('duplicate key')) {
      return res.status(400).json({ error: 'שם המחלקה כבר קיים' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    const used = await query(
      `SELECT COUNT(*)::int AS count
       FROM users
       WHERE department_id = $1`,
      [id]
    );

    if (used.rows[0] && used.rows[0].count > 0) {
      return res.status(400).json({ error: 'לא ניתן למחוק מחלקה שמשויכת לעובדים' });
    }

    await query(
      `DELETE FROM departments
       WHERE id = $1`,
      [id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
