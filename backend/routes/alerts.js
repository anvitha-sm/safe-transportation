const express = require('express');
const router = express.Router();
const { createAlert, listAlerts } = require('../controllers/alertsController');

router.post('/', createAlert);
router.get('/', listAlerts);

module.exports = router;
