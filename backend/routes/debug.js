const express = require('express');
const router = express.Router();
const { seedDemoUser } = require('../controllers/debugController');

// GET /api/debug/seed -> creates/returns demo user with routes
router.get('/seed', seedDemoUser);

module.exports = router;
