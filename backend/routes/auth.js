const express = require("express");
const router = express.Router();
const { register, login, forgotPassword, resetPassword, getUserData, updatePreferences, addRouteFeedback } = require("../controllers/authController");

router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/user/:userId", getUserData);
router.put("/preferences/:userId", updatePreferences);
router.post('/user/:userId/route/:routeId/feedback', addRouteFeedback);

module.exports = router;
