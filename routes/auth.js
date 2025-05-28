const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const router = express.Router();
const pool = require('../db');

// POST /login
router.post('/login', async (req, res) => {
  const { mobile, password } = req.body;
  try {
    const userQuery = await pool.query('SELECT * FROM users WHERE mobile = $1', [mobile]);
    const user = userQuery.rows[0];

    if (!user) return res.status(404).json({ msg: 'User not found' });

    // Compare plain password (or use bcrypt if hashed)
    const isMatch = password === user.password; // Replace with bcrypt.compare if hashed

    if (!isMatch) return res.status(401).json({ msg: 'Invalid credentials' });

    const payload = {
      user_id: user.user_id,
      name: user.name,
      role: user.role,
      mobile: user.mobile,
      email: user.email
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '6h' });

    res.json({ token, user: payload });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /signup
router.post('/signup', async (req, res) => {
  const { name, email, mobile, password, role } = req.body;

  try {
    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE mobile = $1 OR email = $2',
      [mobile, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ msg: 'User already exists' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user
    const newUser = await pool.query(
      `INSERT INTO users (name, email, mobile, password, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id, name, email, mobile, role`,
      [name, email, mobile, hashedPassword, role]
    );

    const payload = newUser.rows[0];

    // Generate JWT token
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '6h' });

    res.status(201).json({ token, user: payload });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
