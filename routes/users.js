const express = require('express');
const bcrypt = require('bcrypt');

const pool = require('../db');

const router = express.Router();


// Get admin profile by ID
router.get('/admin/:id', async (req, res) => {
  const userId = req.params.id;

  try {
    const result = await pool.query(
      'SELECT user_id, name, email, mobile, role FROM users WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ msg: 'User not found' });
    }

    const user = result.rows[0];

    if (user.role !== 'admin') {
      return res.status(403).json({ msg: 'Access denied. Not an admin user.' });
    }

    res.json(user); // sends user_id, name, email, mobile, role (NO password)
  } catch (err) {
    console.error('Error fetching admin profile:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});


// PATCH - Update user with uniqueness check
router.patch("/update_me/:id", async (req, res) => {
  const userId = req.params.id;
  const { name, email, mobile, password } = req.body;

  try {
    // Step 1: Get existing user data
    const userQuery = await pool.query("SELECT * FROM users WHERE user_id = $1", [userId]);

    if (userQuery.rows.length === 0) {
      return res.status(404).json({ msg: "User not found" });
    }

    const currentUser = userQuery.rows[0];

    // Step 2: Check for email/mobile conflicts if changed
    if (
      email !== currentUser.email ||
      mobile !== currentUser.mobile
    ) {
      const conflictQuery = await pool.query(
        `SELECT * FROM users WHERE (email = $1 OR mobile = $2) AND user_id != $3`,
        [email, mobile, userId]
      );

      if (conflictQuery.rows.length > 0) {
        return res.status(409).json({
          msg: "Email or mobile number already in use by another user",
        });
      }
    }

    // Step 3: Build dynamic update query
    let updateQuery = `UPDATE users SET name = $1, email = $2, mobile = $3`;
    let values = [name, email, mobile];

    if (password && password.trim() !== "") {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateQuery += `, password = $4 WHERE user_id = $5`;
      values.push(hashedPassword, userId);
    } else {
      updateQuery += ` WHERE user_id = $4`;
      values.push(userId);
    }

    await pool.query(updateQuery, values);

    res.json({ msg: "User updated successfully" });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
