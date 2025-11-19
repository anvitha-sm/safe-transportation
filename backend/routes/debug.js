const express = require('express');
const router = express.Router();
const { seedDemoUser, getCleanlinessInfo } = require('../controllers/debugController');
router.get('/seed', seedDemoUser);
router.get('/cleanliness', getCleanlinessInfo);

module.exports = router;
