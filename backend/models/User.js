const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const RouteSchema = require("./Route");
const PreferencesSchema = require("./Preferences");

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email:    { type: String, required: true, unique: true },
  name:     { type: String, required: true },
  password: { type: String, required: true },

  routes: [RouteSchema],
  preferences: PreferencesSchema,
});

UserSchema.pre("save", async function(next) {
  if (!this.preferences) {
    this.preferences = {
      lighting: 10,
      footTraffic: 10,
      cleanliness: 10,
      crime: 10,
      speed: 10,
      cost: 10,
    };
n  }

  if (!this.isModified("password")) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", UserSchema);
