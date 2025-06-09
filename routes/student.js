const express = require('express');
const router = express.Router();
const pool = require('../db'); // or wherever your pg Pool is

// GET /students/by-class?class_id=...
router.get('/by-class', async (req, res) => {
  const classId = req.query.class_id;

  if (!classId) {
    return res.status(400).json({ error: 'Missing class_id' });
  }

  try {
    const query = `
      SELECT s.student_id, u.name AS student_name
      FROM students s
      JOIN users u ON s.user_id = u.user_id
      JOIN student_classes sc ON sc.student_id = s.student_id
      WHERE sc.class_id = $1 AND s.is_current_student = TRUE
      ORDER BY u.name;
    `;
    const { rows } = await pool.query(query, [classId]);

    res.json({ students: rows });
  } catch (err) {
    console.error('Error fetching students by class:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
