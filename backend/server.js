
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const authRoutes = require("./routes/auth");
const alertsRoutes = require("./routes/alerts");
const alertsController = require("./controllers/alertsController");
const debugRoutes = require("./routes/debug");
const cleanlinessRoutes = require("./routes/cleanliness");

const app = express();
app.use(cors());
// accept larger JSON bodies for GeoJSON imports
app.use(express.json({ limit: '50mb' }));
app.use((req, res, next) => {
  try { console.log('REQ', req.method, req.path); } catch (e) {}
  next();
});

app.get("/api/bus-directions", alertsController.busDirections);
app.get("/ping", (req, res) => {
  res.json({ message: "backend is working" });
});

app.get('/api/mapbox-token', (req, res) => {
  // Prefer an explicit public token
  if (process.env.MAPBOX_PUBLIC_TOKEN) return res.json({ token: process.env.MAPBOX_PUBLIC_TOKEN });

  // If not set, fall back to MAPBOX_TOKEN when it's clearly a public token.
  // Mapbox public tokens usually begin with 'pk.'; private tokens begin with 'sk.' and must NOT be exposed.
  const tb = process.env.MAPBOX_TOKEN;
  if (tb) {
    if (typeof tb === 'string' && tb.startsWith('sk.')) {
      // Do not expose secret keys
      console.warn('MAPBOX_TOKEN appears to be a secret key (starts with sk.*). Not exposing via /api/mapbox-token');
      return res.status(404).json({ token: null });
    }
    // If it doesn't start with 'sk.', return it (covers tokens that may have lost the 'pk.' prefix accidentally)
    console.warn('MAPBOX_PUBLIC_TOKEN not set; returning MAPBOX_TOKEN fallback (ensure this is a public key)');
    return res.json({ token: tb });
  }
  return res.status(404).json({ token: null });
});

app.use("/api/auth", authRoutes);
app.use("/api/alerts", alertsRoutes);
app.use('/api/cleanliness', cleanlinessRoutes);
app.get("/api/geocode", alertsController.geocode);
app.get("/api/directions", alertsController.directions);
app.use('/api/debug', debugRoutes);
const startServer = () => {
  console.log('Loaded environment variables:', process.env);
  const port = process.env.PORT || 5000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port} (bound to 0.0.0.0)`);
  });
};

if (process.env.MONGO_URI) {
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
      console.log("Connected to MongoDB!");
      startServer();
    })
    .catch((err) => {
      console.error("MongoDB connection error:", err);
      console.warn('Starting server without DB connection (read-only endpoints may fail)');
      startServer();
    });
} else {
  console.warn('MONGO_URI not set; starting server without MongoDB. Some features may be read-only.');
  startServer();
}
