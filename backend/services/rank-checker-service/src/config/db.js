const mongoose = require('mongoose');

const connectDb = async (mongoUri) => {
  await mongoose.connect(mongoUri);
  return mongoose.connection;
};

module.exports = connectDb;
