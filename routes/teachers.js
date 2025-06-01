const express = require('express');
const pool = require('../db');
const bcrypt = require('bcrypt');

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.user_id,
        u.name,
        u.email,
        u.mobile,
        t.teacher_id,
        t.is_class_teacher,
        c.class_name,
        t.class_id
      FROM 
        teachers t
      JOIN 
        users u ON t.user_id = u.user_id
      LEFT JOIN 
        classes c ON t.class_id = c.class_id
      WHERE 
        u.role = 'teacher'
      ORDER BY
        u.name
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching teachers:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /teachers
router.post('/', async (req, res) => {
  const { name, mobile, password } = req.body;
  const email = req.body.email && req.body.email.trim() !== '' ? req.body.email.trim() : null;

  try {
    // Check if user exists (only check email if not null)
    const checkQuery = email
      ? 'SELECT * FROM users WHERE mobile = $1 OR email = $2'
      : 'SELECT * FROM users WHERE mobile = $1';
    const checkValues = email ? [mobile, email] : [mobile];

    const existing = await pool.query(checkQuery, checkValues);
    if (existing.rows.length > 0) {
      return res.status(409).json({ msg: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const insertUserQuery = `
      INSERT INTO users (name, email, mobile, password, role)
      VALUES ($1, $2, $3, $4, 'teacher')
      RETURNING user_id
    `;
    const insertValues = [name, email, mobile, hashedPassword];
    const userResult = await pool.query(insertUserQuery, insertValues);

    const user_id = userResult.rows[0].user_id;

    // Create teacher record
    await pool.query(`INSERT INTO teachers (user_id, is_class_teacher) VALUES ($1, false)`, [user_id]);

    res.status(201).json({ msg: 'Teacher created successfully' });

  } catch (err) {
    console.error('Error in POST /teachers:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PATCH /teachers/:user_id
router.patch('/:user_id', async (req, res) => {
  const { user_id } = req.params;
  const { name, email, mobile} = req.body;

  try {
    const userQuery = `
        UPDATE users SET name = $1, email = $2, mobile = $3
        WHERE user_id = $4
    `;
    await pool.query(userQuery, [name, email, mobile, user_id]);

    res.status(200).json({ msg: 'Teacher updated successfully' });
  } catch (err) {
    console.error('Error in PATCH /teachers/:user_id:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /teachers/:userId
router.delete('/:userId', async (req, res) => {
  const userId = req.params.userId;

  try {
    // First, delete from teachers table (foreign key to users)
    await pool.query(
      'DELETE FROM teachers WHERE user_id = $1',
      [userId]
    );

    // Then, delete from users table
    await pool.query(
      'DELETE FROM users WHERE user_id = $1',
      [userId]
    );

    res.json({ msg: "Teacher deleted successfully" });

  } catch (err) {
    console.error("Error deleting teacher:", err);
    res.status(500).json({ msg: "Server error while deleting teacher" });
  }
});



module.exports = router;
