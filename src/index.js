require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pdfRoutes = require('./routes/pdf');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:8080' }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', pdfRoutes);

app.listen(PORT, () => {
  console.log(`DPE Backend running on port ${PORT}`);
});
