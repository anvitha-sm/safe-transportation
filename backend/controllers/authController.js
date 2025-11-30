const User = require("../models/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });
};


const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

exports.register = async (req, res) => {
  try {
    const { username, name, email, password, locationGranted, latitude, longitude } = req.body;


    if (!username || !name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }


    if (username.length < 3) {
      return res.status(400).json({ message: "Username must be at least 3 characters" });
    }


    if (name.length < 3) {
      return res.status(400).json({ message: "Name must be at least 3 characters" });
    }


    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }


    if (password.length < 6) {
      return res.status(400).json({ message: "Password is not at least 6 characters" });
    }


    const emailExists = await User.findOne({ email });
    if (emailExists) {
      return res.status(400).json({ message: "Email address in use" });
    }


    const usernameExists = await User.findOne({ username });
    if (usernameExists) {
      return res.status(400).json({ message: "Username taken" });
    }

    const createPayload = {
      username,
      name,
      email,
      password,
      preferences: {
        lighting: 10,
        footTraffic: 10,
        cleanliness: 10,
        crime: 10,
        speed: 10,
        cost: 10,
      },
      routes: [],
    };

    if (locationGranted) {
      createPayload.locationGranted = true;
      if (typeof latitude === 'number') createPayload.latitude = latitude;
      if (typeof longitude === 'number') createPayload.longitude = longitude;
    }

    const user = await User.create(createPayload);

    res.json({
      message: "User created",
      token: generateToken(user._id),
      user: {
        _id: user._id,
        username: user.username,
        name: user.name,
        email: user.email,
        routes: user.routes || [],
        preferences: user.preferences || {
          lighting: 10,
          footTraffic: 10,
          cleanliness: 10,
          crime: 10,
          speed: 10,
          cost: 10,
        },
        locationGranted: user.locationGranted || false,
        latitude: user.latitude,
        longitude: user.longitude,
      }
    });
  } catch (e) {

    if (e.code === 11000) {
      const field = Object.keys(e.keyPattern)[0];
      if (field === "email") {
        return res.status(400).json({ message: "Email address in use" });
      } else if (field === "username") {
        return res.status(400).json({ message: "Username taken" });
      }
    }
    res.status(500).json({ message: "Error creating account. Please try again." });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;


    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const match = await user.matchPassword(password);
    if (!match) return res.status(400).json({ message: "Invalid credentials" });

    res.json({
      message: "Login successful",
      token: generateToken(user._id),
      user: {
        _id: user._id,
        username: user.username,
        name: user.name,
        email: user.email,
        routes: user.routes || [],
        preferences: user.preferences || {
          lighting: 10,
          footTraffic: 10,
          cleanliness: 10,
          crime: 10,
          speed: 10,
          cost: 10,
        }
      }
    });
  } catch (e) {
    res.status(500).json({ message: "Error logging in. Please try again." });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;


    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }


    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }


    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }








    res.json({
      message: "Password reset instructions have been sent to your email",
      email: email
    });
  } catch (e) {
    res.status(500).json({ message: "Error processing password reset request" });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;


    if (!email || !newPassword) {
      return res.status(400).json({ message: "Email and new password are required" });
    }


    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }


    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }


    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }


    user.password = newPassword;
    await user.save();

    res.json({
      message: "Password reset successfully",
      token: generateToken(user._id),
      user: {
        _id: user._id,
        username: user.username,
        name: user.name,
        email: user.email
      }
    });
  } catch (e) {
    res.status(500).json({ message: "Error resetting password" });
  }
};

exports.getUserData = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }


    res.json({
      user: {
        _id: user._id,
        username: user.username,
        name: user.name,
        email: user.email,
        routes: user.routes || [],
        preferences: user.preferences || {
          lighting: 10,
          footTraffic: 10,
          cleanliness: 10,
          crime: 10,
          speed: 10,
          cost: 10
        }
      }
    });
  } catch (e) {
    res.status(500).json({ message: "Error fetching user data" });
  }
};

exports.updatePreferences = async (req, res) => {
  try {
    const { userId } = req.params;
    const { preferences } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    if (!preferences) {
      return res.status(400).json({ message: "Preferences are required" });
    }


    const validPreferences = {};
    for (const [key, value] of Object.entries(preferences)) {
      if (typeof value === 'number' && value >= 0 && value <= 20) {
        validPreferences[key] = value;
      }
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { preferences: validPreferences },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "Preferences updated successfully",
      preferences: user.preferences
    });
  } catch (e) {
    res.status(500).json({ message: "Error updating preferences" });
  }
};

exports.addRouteFeedback = async (req, res) => {
  try {
    const { userId, routeId } = req.params;
    const { ratings, comments, ratedBy } = req.body;

    if (!userId || !routeId) return res.status(400).json({ message: 'userId and routeId required' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Try robust ways to find the route (subdocument id or plain _id string)
    let route = null;
    try {
      route = user.routes.id ? user.routes.id(routeId) : null;
    } catch (e) {
      route = null;
    }
    if (!route) {
      // fallback: find by string match of _id
      route = (user.routes || []).find(r => String(r._id) === String(routeId));
    }
    if (!route) {
      console.warn('addRouteFeedback: route not found for user', userId, 'routeId', routeId, 'user.routes.length', (user.routes || []).length);
      return res.status(404).json({ message: 'Route not found' });
    }

    console.log('addRouteFeedback: found route', { userId, routeId, routeStart: route.start, routeEnd: route.end });

    // Sanitize incoming ratings: only allow known keys and numeric values
    const allowedKeys = ['lighting','footTraffic','cleanliness','crime','speed','cost'];
    const sanitizedRatings = {};
    if (ratings && typeof ratings === 'object') {
      for (const k of allowedKeys) {
        if (ratings[k] != null && !isNaN(Number(ratings[k]))) {
          const v = Number(ratings[k]);
          // clamp to 0..20
          sanitizedRatings[k] = Math.max(0, Math.min(20, v));
        }
      }
    }

    route.feedback = route.feedback || {};
    route.feedback.ratings = Object.keys(sanitizedRatings).length > 0 ? sanitizedRatings : (route.feedback.ratings || {});
    route.feedback.comments = (typeof comments === 'string' && comments.length > 0) ? comments : (route.feedback.comments || '');
    route.feedback.ratedAt = new Date();
    if (ratedBy) route.feedback.ratedBy = ratedBy;

    // Mark the routes array modified so mongoose persists subdocument changes
    try { user.markModified('routes'); } catch (e) {}

    await user.save();

    // Return the updated route object (find again to ensure _id etc.)
    const outRoute = (user.routes || []).find(r => String(r._id) === String(routeId));
    res.json({ success: true, route: outRoute });
  } catch (err) {
    console.error('addRouteFeedback error', err && (err.stack || err));
    // include original error message in response for debugging (non-production)
    res.status(500).json({ message: 'Failed to save feedback', error: (err && err.message) || String(err) });
  }
};

