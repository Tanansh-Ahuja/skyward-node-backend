require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const app = express();


const authRoutes = require('./routes/auth');
const utilsRoutes = require("./routes/utils");
const sessionRouter = require('./routes/session');
const classRoutes = require('./routes/classes');
const subjectMapRoutes = require('./routes/subject_map');
const teachersRoutes = require('./routes/teachers');
const usersRoutes = require('./routes/users');
const studentRoutes = require('./routes/student');
const marksRoutes = require('./routes/marks');

// Enable CORS only for specific origin
const allowedOrigin = process.env.CORS_ORIGIN || 'http://127.0.0.1:5500/login.html';

app.use(cors({
  origin: allowedOrigin,
  credentials: true // allow cookies or auth headers if needed
}));

app.use(express.json());
app.use(morgan('dev'));

app.use('/auth', authRoutes);
app.use('/utils', utilsRoutes);
app.use('/sessions', sessionRouter);
app.use('/classes',classRoutes);
app.use('/subject_map',subjectMapRoutes);
app.use('/teachers',teachersRoutes);
app.use('/users',usersRoutes);
app.use('/student',studentRoutes);
app.use('/marks',marksRoutes);

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
