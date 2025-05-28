require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const app = express();


const authRoutes = require('./routes/auth');
const utilsRoutes = require("./routes/utils")

// Enable CORS only for specific origin
const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:5500';

app.use(cors({
  origin: allowedOrigin,
  credentials: true // allow cookies or auth headers if needed
}));

app.use(express.json());
app.use(morgan('dev'));

app.use('/auth', authRoutes);
app.use('/utils', utilsRoutes);

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
