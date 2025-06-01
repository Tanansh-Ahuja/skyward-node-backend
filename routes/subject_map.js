// File: routes/subjects.js
const express = require('express');
const router = express.Router();
const pool = require('../db');


// =============================
// SECTION 2: Mapping Summary
// =============================
router.get("/summary", async (req, res) => {
  const client = await pool.connect();

  try {
    // 1. Get all classes with class_id, class_name, grade, section
    const classRes = await client.query(`
      SELECT class_id, grade, section
      FROM classes
      ORDER BY grade, section
    `);

    const classList = classRes.rows;

    // 2. Get all class_subject mappings with subject names
    const subjectMapRes = await client.query(`
      SELECT cs.class_id, s.subject_name
      FROM class_subjects cs
      JOIN subjects s ON cs.subject_id = s.subject_id
    `);

    const subjectMap = {};
    subjectMapRes.rows.forEach(row => {
      if (!subjectMap[row.class_id]) {
        subjectMap[row.class_id] = [];
      }
      subjectMap[row.class_id].push(row.subject_name);
    });

    // 3. Assemble the final response
    const response = classList.map(cls => ({
      grade: cls.grade,
      section: cls.section,
      subjects: subjectMap[cls.class_id] || []
    }));

    res.json(response);

  } catch (err) {
    console.error("Error fetching mapping summary:", err);
    res.status(500).json({ message: "Internal server error" });
  } finally {
    client.release();
  }
});


// =============================
// SECTION 1: Manage Subjects
// =============================

// 1. Get all subjects
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM subjects ORDER BY subject_id');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching subjects:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /subject_map/:classId
router.get('/:classId', async (req, res) => {
  const classId = req.params.classId;

  try {
    const result = await pool.query(
      `SELECT s.subject_id, s.subject_name
       FROM class_subjects cs
       JOIN subjects s ON cs.subject_id = s.subject_id
       WHERE cs.class_id = $1`,
      [classId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching subjects for class:", err);
    res.status(500).json({ msg: "Internal server error" });
  }
});

// 2. Add a new subject
router.post('/', async (req, res) => {
  const { subject_name } = req.body;

  try {
    const duplicateCheck = await pool.query(
      'SELECT * FROM subjects WHERE subject_name = $1',
      [subject_name]
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Subject already exists' });
    }

    const result = await pool.query(
      'INSERT INTO subjects (subject_name) VALUES ($1) RETURNING *',
      [subject_name]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error adding subject:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 3. Delete a subject
router.delete('/:id', async (req, res) => {
  const subjectId = req.params.id;

  try {
    await pool.query('DELETE FROM subjects WHERE subject_id = $1', [subjectId]);
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting subject:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// =============================
// SECTION 3: Manage Mappings
// =============================

// GET /subject_map/grades
router.get('/grades', (req, res) => {
  const grades = Array.from({ length: 12 }, (_, i) => i + 1); // [1, 2, ..., 12]
  res.json(grades);
});

router.get('/mapped-subjects/:grade', async (req, res) => {
  const { grade } = req.params;

  try {
    // Step 1: Get all class_ids for the given grade
    const classRes = await pool.query(
      'SELECT class_id FROM classes WHERE grade = $1 ORDER BY section ASC',
      [grade]
    );

    const classIds = classRes.rows.map(row => row.class_id);

    if (classIds.length === 0) {
      return res.status(404).json({ error: "No classes found for this grade." });
    }

    // Step 2: Pick the first class_id (e.g. class 2A)
    const sampleClassId = classIds[0];

    // Step 3: Get all subject_ids mapped to this class
    const mappingRes = await pool.query(
      'SELECT subject_id FROM class_subjects WHERE class_id = $1',
      [sampleClassId]
    );

    const subjectIds = mappingRes.rows.map(row => row.subject_id);

    if (subjectIds.length === 0) {
      return res.json([]); // Return empty list if no subjects mapped yet
    }

    // Step 4: Fetch subject names
    const subjectsRes = await pool.query(
      `SELECT subject_id, subject_name FROM subjects WHERE subject_id = ANY($1)`,
      [subjectIds]
    );

    res.json(subjectsRes.rows); // e.g. [{subject_id: 1, subject_name: 'Math'}]
  } catch (err) {
    console.error("Error fetching mapped subjects:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/map-subjects", async (req, res) => {
  const { grade, subject_ids } = req.body;

  if (!grade || !Array.isArray(subject_ids) || subject_ids.length === 0) {
    return res.status(400).json({ message: "Grade and subject_ids are required." });
  }

  const client = await pool.connect();

  try {
    // 1. Get all class_ids for the given grade
    const classRes = await client.query(
      "SELECT class_id FROM classes WHERE grade = $1",
      [grade]
    );

    const classIds = classRes.rows.map(row => row.class_id);

    if (classIds.length === 0) {
      return res.status(404).json({ message: "No classes found for this grade." });
    }

    await client.query("BEGIN");

    // 2. Delete existing mappings for all these classes
    await client.query(
      "DELETE FROM class_subjects WHERE class_id = ANY($1)",
      [classIds]
    );

    // 3. Insert new mappings
    const insertValues = [];
    const insertParams = [];
    let paramIndex = 1;

    for (const classId of classIds) {
      for (const subjectId of subject_ids) {
        insertValues.push(`($${paramIndex++}, $${paramIndex++})`);
        insertParams.push(classId, subjectId);
      }
    }

    if (insertValues.length > 0) {
      const insertQuery = `
        INSERT INTO class_subjects (class_id, subject_id)
        VALUES ${insertValues.join(", ")}
      `;
      await client.query(insertQuery, insertParams);
    }

    await client.query("COMMIT");
    res.json({ message: "Subjects mapped successfully." });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error mapping subjects:", err);
    res.status(500).json({ message: "Internal server error." });
  } finally {
    client.release();
  }
});

module.exports = router;
