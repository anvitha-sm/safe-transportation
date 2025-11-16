require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const authRoutes = require("./routes/auth");
const alertsRoutes = require("./routes/alerts");
const alertsController = require("./controllers/alertsController");
const debugRoutes = require("./routes/debug");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/ping", (req, res) => {
  res.json({ message: "backend is working" });
});

app.use("/api/auth", authRoutes);
app.use("/api/alerts", alertsRoutes);
app.get("/api/geocode", alertsController.geocode);
app.use('/api/debug', debugRoutes);
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("Connected to MongoDB!");

    app.listen(process.env.PORT, () => {
      console.log(`Server running on port ${process.env.PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });
