const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

router.get('/verify-token', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ msg: 'No token' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ valid: true, role: decoded.role });
  } catch (err) {
    res.status(403).json({ msg: 'Invalid or expired token' });
  }
});

module.exports = router;
