require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function main() {
  try {
    if (!process.env.MONGO_URI) {
      console.error('MONGO_URI not set in environment');
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    let user = await User.findOne({ email: 'test@test.test' });
    if (!user) {
      user = new User({
        username: 'testtest',
        name: 'test',
        email: 'test@test.test',
        password: 'testtest',
        preferences: {
          lighting: 12,
          footTraffic: 8,
          cleanliness: 10,
          crime: 5,
          speed: 15,
          cost: 6,
        },
        routes: [],
      });
      await user.save();
      console.log('Created demo user:', user._id.toString());
    } else {
      console.log('Demo user already exists:', user._id.toString());
    }

    // Overwrite demo user's routes with three mock routes
    user.routes = [
      {
        start: '123 Main St',
        end: 'City Park',
        date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
        mode: 'walking',
      },
      {
        start: 'Office Plaza',
        end: 'Train Station',
        date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1),
        mode: 'transit',
      },
      {
        start: 'Home',
        end: 'Grocery Store',
        date: new Date(),
        mode: 'driving',
      },
    ];

    await user.save();
    console.log('Seeded mock routes for demo user. Routes:');
    console.log(user.routes.map(r => ({ _id: r._id.toString(), start: r.start, end: r.end, date: r.date, mode: r.mode })));

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error seeding demo user:', err);
    process.exit(1);
  }
}

main();
