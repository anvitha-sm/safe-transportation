const User = require('../models/User');
const bcrypt = require('bcryptjs');
const StreetCleanliness = require('../models/StreetCleanliness');

exports.seedDemoUser = async (req, res) => {
  try {
    let user = await User.findOne({ email: 'test@test.test' });
    if (!user) {
      const password = await bcrypt.hash('testtest', 10);
      user = await User.create({
        username: 'testtest',
        name: 'test',
        email: 'test@test.test',
        password,
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
    }
    user.routes = [
      {
        _id: user._id + '_r1',
        start: '123 Main St',
        end: 'City Park',
        date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
        mode: 'walking',
      },
      {
        _id: user._id + '_r2',
        start: 'Office Plaza',
        end: 'Train Station',
        date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1),
        mode: 'transit',
      },
      {
        _id: user._id + '_r3',
        start: 'Home',
        end: 'Grocery Store',
        date: new Date(),
        mode: 'driving',
      },
    ];

    await user.save();

    res.json({
      message: 'Demo user seeded',
      user: {
        _id: user._id,
        email: user.email,
        username: user.username,
        routes: user.routes,
      },
    });
  } catch (err) {
    console.error('seedDemoUser error', err);
    res.status(500).json({ message: 'Failed to seed demo user' });
  }
};

exports.getCleanlinessInfo = async (req, res) => {
  try {
    const count = await StreetCleanliness.countDocuments();
    const one = await StreetCleanliness.findOne().lean();
    return res.json({ count, sample: one ? { properties: one.properties || null, geometryType: one.geometry && one.geometry.type, coordinatesPreview: (one.geometry && Array.isArray(one.geometry.coordinates)) ? one.geometry.coordinates.slice(0,3) : null } : null });
  } catch (err) {
    console.error('getCleanlinessInfo error', err);
    return res.status(500).json({ message: 'Failed to fetch cleanliness info' });
  }
};
