const express = require('express');
const pool = require('../db');
const bcrypt = require('bcrypt');

const router = express.Router();

//////////////////////////////
// HELPER FUNCTION
//////////////////////////////
// Helper: Get current session ID
async function getCurrentSessionId() {
  const today = new Date().toISOString().split("T")[0]; // yyyy-mm-dd
  const result = await pool.query(
    `SELECT session_id FROM sessions 
     WHERE start_date <= $1 AND end_date >= $1 
     LIMIT 1`, [today]);
  if (result.rows.length === 0) throw new Error("No active session found");
  return result.rows[0].session_id;
}


//////////////////////////////////////////////////////////////////////
// BASIC QUERRIES
/////////////////////////////////////////////////////////

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

// GET: Class-Teacher mappings
router.get('/get_class_teacher_mappings', async (req, res) => {
  try {
    const sessionId = await getCurrentSessionId();

    const result = await pool.query(`
      SELECT 
        c.class_name,
        u.name AS class_teacher,
        s.subject_name,
        c.class_id,
        t.teacher_id
      FROM teacher_assignments ta
      JOIN teachers t ON ta.teacher_id = t.teacher_id
      JOIN users u ON t.user_id = u.user_id
      JOIN classes c ON ta.class_id = c.class_id
      JOIN subjects s ON ta.subject_id = s.subject_id
      WHERE ta.session_id = $1
        AND t.is_class_teacher = true
    `, [sessionId]);

    res.json(result.rows);

  } catch (err) {
    console.error("Error fetching class-teacher mappings:", err);
    res.status(500).json({ error: "Failed to fetch mappings" });
  }
});

// GET /teachers/view_subject_teacher_mappings
router.get("/view_subject_teacher_mappings", async (req, res) => {
  try {
    const session_id = await getCurrentSessionId();
    if (!session_id) return res.status(400).json({ error: "No active session found." });

    // 1. Get all classes
    const { rows: classes } = await pool.query(`
      SELECT class_id, class_name FROM classes
    `);

    const finalResult = [];

    for (let cls of classes) {
      const { class_id, class_name } = cls;

      // 2. For each class, get subject-teacher assignments
      const { rows: subject_teacher } = await pool.query(`
        SELECT 
          s.subject_id,
          s.subject_name,
          t.teacher_id,
          u.name AS teacher_name
        FROM teacher_assignments ta
        JOIN teachers t ON ta.teacher_id = t.teacher_id
        JOIN subjects s ON ta.subject_id = s.subject_id
        JOIN users u ON u.user_id = t.user_id
        WHERE ta.class_id = $1 AND ta.session_id = $2
        ORDER BY s.subject_name
      `, [class_id, session_id]);

      finalResult.push({
        class_name,
        class_id,
        subject_teacher
      });
    }

    res.json(finalResult);
  } catch (err) {
    console.error("Error fetching subject-teacher mappings:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/assign_subject_teacher", async (req, res) => {
  const { class_id, subject_id, teacher_id } = req.body;

  if (!class_id || !subject_id || !teacher_id) {
    return res.status(400).json({ error: "Missing class_id, subject_id or teacher_id" });
  }

  try {
    const session_id = await getCurrentSessionId();
    if (!session_id) {
      return res.status(400).json({ error: "No active session found" });
    }

    // Check if an assignment already exists
    const { rows: existing } = await pool.query(`
      SELECT * FROM teacher_assignments
      WHERE class_id = $1 AND subject_id = $2 AND session_id = $3
    `, [class_id, subject_id, session_id]);

    if (existing.length > 0) {
      // Update existing teacher assignment
      await pool.query(`
        UPDATE teacher_assignments
        SET teacher_id = $1
        WHERE class_id = $2 AND subject_id = $3 AND session_id = $4
      `, [teacher_id, class_id, subject_id, session_id]);
    } else {
      // Insert new assignment
      await pool.query(`
        INSERT INTO teacher_assignments (class_id, subject_id, teacher_id, session_id)
        VALUES ($1, $2, $3, $4)
      `, [class_id, subject_id, teacher_id, session_id]);
    }

    res.status(200).json({ message: "Subject teacher assigned successfully" });

  } catch (err) {
    console.error("Error assigning subject teacher:", err);
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

router.post('/class_teacher_mappings', async (req, res) => {
  const { class_id, user_id, subject_id } = req.body;

  try {
    // Step 1: Fetch current session
    const sessionQuery = await pool.query(
      `SELECT session_id FROM sessions WHERE CURRENT_DATE BETWEEN start_date AND end_date`
    );

    if (sessionQuery.rows.length === 0) {
      return res.status(400).json({ msg: 'No active session found.' });
    }

    const session_id = sessionQuery.rows[0].session_id;

    // Step 2: Check if this class already has a class teacher
    const existingClassTeacher = await pool.query(
      `SELECT * FROM teachers WHERE class_id = $1 AND is_class_teacher = true`,
      [class_id]
    );

    if (existingClassTeacher.rows.length > 0) {
      return res.status(400).json({ msg: 'This class already has a class teacher assigned.' });
    }

    // Step 3: Get teacher_id from user_id
    const teacherRow = await pool.query(
      `SELECT teacher_id FROM teachers WHERE user_id = $1`,
      [user_id]
    );

    const teacher_id = teacherRow.rows[0]?.teacher_id;

    if (!teacher_id) {
      return res.status(400).json({ msg: 'Invalid teacher user ID.' });
    }

    // Step 4: Mark teacher as class teacher and assign class
    await pool.query(
      `UPDATE teachers SET is_class_teacher = true, class_id = $1 WHERE user_id = $2`,
      [class_id, user_id]
    );

    // Step 5: Create teacher assignment
    await pool.query(
      `INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, session_id)
       VALUES ($1, $2, $3, $4)`,
      [teacher_id, class_id, subject_id, session_id]
    );

    res.json({ msg: 'Class teacher mapped and assignment created successfully.' });

  } catch (err) {
    console.error("Error in POST /class_teacher_mappings:", err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// DELETE /teachers/class_teacher_mappings/:class_id
router.delete('/unassign_class_teacher', async (req, res) => {
  const { class_id, teacher_id } = req.body;

  try {
    await pool.query(`
      DELETE FROM teacher_assignments
      WHERE class_id = $1 AND teacher_id = $2
    `, [class_id, teacher_id]);

    await pool.query(`UPDATE teachers SET is_class_teacher = false, class_id = NULL WHERE teacher_id = $1`, [teacher_id]);

    res.status(200).json({ message: "Class teacher unassigned successfully." });
  } catch (err) {
    console.error("Error unassigning class teacher:", err);
    res.status(500).json({ error: "Failed to unassign class teacher." });
  }
});

// GET /teachers/unassigned
router.get('/unassigned', async (req, res) => {
  try {
    // Step 1: Get all user_ids from teachers where is_class_teacher is false
    const teacherRes = await pool.query(`
      SELECT user_id FROM teachers WHERE is_class_teacher = false
    `);

    const userIds = teacherRes.rows.map(row => row.user_id);

    if (userIds.length === 0) {
      return res.json([]); // No unassigned teachers
    }

    // Step 2: Fetch names of those user_ids from users table
    const placeholders = userIds.map((_, idx) => `$${idx + 1}`).join(', ');
    const userRes = await pool.query(
      `SELECT user_id, name FROM users WHERE user_id IN (${placeholders})`,
      userIds
    );

    res.json(userRes.rows); // returns [{ user_id, name }, ...]
    
  } catch (err) {
    console.error("Error fetching unassigned teachers:", err);
    res.status(500).json({ msg: "Server error" });
  }
});


/////////////////////////////////////////
// HEADER QUERRIES
///////////////////////////////////////////


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
