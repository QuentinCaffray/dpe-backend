const express = require('express');
const multer = require('multer');
const { processPdf } = require('../controllers/pdf');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/process', upload.fields([
  { name: 'pdf', maxCount: 1 },
  { name: 'logo', maxCount: 1 },
  { name: 'cover', maxCount: 1 },
  { name: 'endPages', maxCount: 10 },
  { name: 'buildingPhotos', maxCount: 6 },
]), processPdf);

module.exports = router;
