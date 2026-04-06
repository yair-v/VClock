const express = require('express');
const bcrypt = require('bcryptjs');
const { all, get, run } = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken, requireAdmin);

router.get('/', async (req, res) => {
  try {
    const users = await all(
      `SELECT id, employee_code, full_name, role, is_active, created_at
       FROM users
       ORDER BY full_name ASC`
    );
    res.json(users);
  } catch (error) {
    console.error('LOAD USERS ERROR:', error);
    res.status(500).json({ message: 'Failed to load users' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { employeeCode, fullName, password, role = 'employee', isActive = true } = req.body;

    if (!employeeCode || !fullName || !password) {
      return res.status(400).json({ message: 'Employee code, full name and password are required' });
    }

    const existingUser = await get('SELECT id FROM users WHERE employee_code = ?', [employeeCode]);
    if (existingUser) {
      return res.status(400).json({ message: 'Employee code already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await run(
      `INSERT INTO users (employee_code, full_name, password_hash, role, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [employeeCode, fullName, passwordHash, role, isActive ? 1 : 0]
    );

    res.json({ message: 'User created successfully' });
  } catch (error) {
    console.error('CREATE USER ERROR:', error);
    res.status(500).json({ message: 'Failed to create user' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, role, isActive, password } = req.body;

    const user = await get('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const nextFullName = fullName ?? user.full_name;
    const nextRole = role ?? user.role;
    const nextIsActive = typeof isActive === 'boolean' ? (isActive ? 1 : 0) : user.is_active;

    await run(
      `UPDATE users
       SET full_name = ?, role = ?, is_active = ?
       WHERE id = ?`,
      [nextFullName, nextRole, nextIsActive, id]
    );

    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      await run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id]);
    }

    res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('UPDATE USER ERROR:', error);
    res.status(500).json({ message: 'Failed to update user' });
  }
});

module.exports = router;
