const express = require('express');
const pool = require('../db');

const router = express.Router();

// =======================
// GET all classes
// =======================
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM classes ORDER BY grade, section');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching classes:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// =======================
// POST new class
// =======================
router.post('/', async (req, res) => {
  const { class_name, grade, section } = req.body;

  if (!class_name || !grade || !section) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    // Check if class already exists
    const duplicateCheck = await pool.query(
      'SELECT * FROM classes WHERE class_name = $1',
      [class_name]
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Class already exists' });
    }

    // Insert new class
    const result = await pool.query(
      'INSERT INTO classes (class_name, grade, section) VALUES ($1, $2, $3) RETURNING *',
      [class_name, grade, section]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating class:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// =======================
// DELETE a class by ID
// =======================
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM classes WHERE class_id = $1 RETURNING *',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Class not found' });
    }

    res.json({ message: 'Class deleted successfully' });
  } catch (err) {
    console.error('Error deleting class:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
