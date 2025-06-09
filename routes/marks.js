const express = require("express");
const router = express.Router();
const pool = require("../db");


router.get('/by-class-subject-exam', async (req, res) => {
  const { class_id, subject_id, exam_type } = req.query;

  if (!class_id || !subject_id || !exam_type) {
    return res.status(400).json({ error: 'Missing required query parameters.' });
  }

  try {
    const query = `
      SELECT
        s.student_id,
        u.name AS student_name,
        m.marks_obtained,
        m.grade,
        m.on_leave
    FROM students s
    JOIN users u ON s.user_id = u.user_id
    JOIN student_classes sc ON sc.student_id = s.student_id
    LEFT JOIN marks m
    ON s.student_id = m.student_id
    AND m.class_id = $1
    AND m.subject_id = $2
    AND m.exam_type = $3
    WHERE sc.class_id = $1 AND s.is_current_student = true
    ORDER BY u.name;
    `;

    const { rows } = await pool.query(query, [class_id, subject_id, exam_type]);

    res.json({ entries: rows });
  } catch (err) {
    console.error('Error fetching marks by class/subject/exam:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.post("/submit", async (req, res) => {
  const { entries } = req.body;

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ msg: "No entries provided" });
  }
  const client = await pool.connect();

  // 1. Get current session_id
    const sessionResult = await client.query(
      `SELECT session_id FROM sessions 
       WHERE CURRENT_DATE BETWEEN start_date AND end_date 
       LIMIT 1`
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ msg: "No active session found" });
    }

    const sessionId = sessionResult.rows[0].session_id;

  
  try {
    await client.query("BEGIN");

    const insertQuery = `
      INSERT INTO marks (
        student_id, subject_id, class_id, session_id,
        exam_type, marks_obtained, total_marks, grade, on_leave
      )
      VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9
      )
      ON CONFLICT (student_id, subject_id, class_id, session_id, exam_type)
      DO UPDATE SET
        marks_obtained = EXCLUDED.marks_obtained,
        total_marks = EXCLUDED.total_marks,
        grade = EXCLUDED.grade,
        on_leave = EXCLUDED.on_leave
    `;

    for (const entry of entries) {
      const {
        student_id,
        subject_id,
        class_id,
        exam_type,
        marks_obtained,
        total_marks,
        grade,
        on_leave
      } = entry;

      await client.query(insertQuery, [
        student_id,
        subject_id,
        class_id,
        sessionId,
        exam_type,
        marks_obtained,
        total_marks,
        grade,
        on_leave
      ]);
    }

    await client.query("COMMIT");
    res.json({ msg: "Marks submitted successfully" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error submitting marks:", err.message);
    res.status(500).json({ msg: "Internal server error" });
  } finally {
    client.release();
  }
});


router.put("/update", async (req, res) => {
  const { entries } = req.body;

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ msg: "No entries provided for update." });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const entry of entries) {
      const {
        student_id,
        class_id,
        subject_id,
        exam_type,
        marks_obtained,
        total_marks,
        grade,
        on_leave
      } = entry;

      await client.query(
        `UPDATE marks
         SET marks_obtained = $1,
             total_marks = $2,
             grade = $3,
             on_leave = $4
         WHERE student_id = $5
           AND class_id = $6
           AND subject_id = $7
           AND exam_type = $8`,
        [
          marks_obtained,
          total_marks,
          grade,
          on_leave,
          student_id,
          class_id,
          subject_id,
          exam_type
        ]
      );
    }

    await client.query("COMMIT");
    res.json({ msg: "Marks updated successfully!" });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Update failed:", err);
    res.status(500).json({ msg: "Internal server error while updating marks." });

  } finally {
    client.release();
  }
});



module.exports = router;
