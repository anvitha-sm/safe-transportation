const express = require('express');
const router = express.Router();
const { seedDemoUser } = require('../controllers/debugController');
router.get('/seed', seedDemoUser);

module.exports = router;
