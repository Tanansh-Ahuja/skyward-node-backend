const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET all sessions
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sessions ORDER BY session_id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('GET sessions error:', err);
    res.status(500).json({ message: 'Failed to fetch sessions.' });
  }
});

// POST new session
router.post('/', async (req, res) => {
  const { session_name, start_date, end_date } = req.body;

  if (!session_name || !start_date || !end_date) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO sessions (session_name, start_date, end_date) VALUES ($1, $2, $3) RETURNING *',
      [session_name, start_date, end_date]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST session error:', err);
    res.status(500).json({ message: 'Failed to create session.' });
  }
});

// PATCH existing session
router.patch('/:session_id', async (req, res) => {
  const { session_id } = req.params;
  const { session_name, start_date, end_date } = req.body;

  if (!session_name || !start_date || !end_date) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    const result = await pool.query(
      'UPDATE sessions SET session_name = $1, start_date = $2, end_date = $3 WHERE session_id = $4 RETURNING *',
      [session_name, start_date, end_date, session_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Session not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('PATCH session error:', err);
    res.status(500).json({ message: 'Failed to update session.' });
  }
});

// DELETE a session
router.delete('/:session_id', async (req, res) => {
  const { session_id } = req.params;

  try {
    const result = await pool.query('DELETE FROM sessions WHERE session_id = $1 RETURNING *', [session_id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Session not found.' });
    }

    res.json({ message: 'Session deleted successfully.' });
  } catch (err) {
    console.error('DELETE session error:', err);
    res.status(500).json({ message: 'Failed to delete session.' });
  }
});

module.exports = router;
