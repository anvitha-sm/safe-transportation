require('dotenv').config();
const mongoose = require('mongoose');
const CommunityAlert = require('../models/CommunityAlert');

async function main() {
  try {
    if (!process.env.MONGO_URI) {
      console.error('MONGO_URI not set in environment');
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    const existing = await CommunityAlert.countDocuments();
    if (existing >= 6) {
      console.log(`Already have ${existing} community alerts. Skipping seeding.`);
      const some = await CommunityAlert.find({}).limit(10).lean();
      console.log('Sample alerts:', some.map(a => ({ id: a._id.toString(), location: a.location, latitude: a.latitude, longitude: a.longitude, description: a.description })));
      await mongoose.disconnect();
      process.exit(0);
    }

    const docs = [
      {
        location: 'Market St & 5th St, San Francisco',
        latitude: 37.7840,
        longitude: -122.4064,
        description: 'Heavy foot traffic and slip hazard after rain',
        username: 'demo_user',
        category: 'foot_traffic',
        severity: 'medium',
      },
      {
        location: 'Embarcadero Plaza',
        latitude: 37.7955,
        longitude: -122.3937,
        description: 'Construction blocking pedestrian route',
        username: 'city_watch',
        category: 'construction',
        severity: 'high',
      },
      {
        location: 'Mission St & 16th St',
        latitude: 37.7652,
        longitude: -122.4191,
        description: 'Streetlight out at night',
        username: 'jane.d',
        category: 'lighting',
        severity: 'medium',
      },
      {
        location: '16th Ave & Geary Blvd',
        latitude: 37.7810,
        longitude: -122.4687,
        description: 'Pothole reported causing bike hazard',
        username: 'bike_cop',
        category: 'road',
        severity: 'high',
      },
      {
        location: 'Powell St BART Station',
        latitude: 37.7831,
        longitude: -122.4089,
        description: 'Suspicious activity reported near entrance',
        username: 'anonymous',
        category: 'safety',
        severity: 'urgent',
      },
      {
        location: 'Golden Gate Park - Music Concourse',
        latitude: 37.7701,
        longitude: -122.4687,
        description: 'Large crowd reported during event',
        username: 'event_staff',
        category: 'event',
        severity: 'low',
      },
    ];

    const inserted = await CommunityAlert.insertMany(docs);
    console.log('Inserted alerts:');
    inserted.forEach((a) => console.log({ id: a._id.toString(), location: a.location, lat: a.latitude, lon: a.longitude }));

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error seeding alerts:', err);
    process.exit(1);
  }
}

main();
