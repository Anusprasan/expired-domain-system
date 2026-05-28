const mongoose = require('mongoose');

const serpResultItemSchema = new mongoose.Schema(
  {
    rank: { type: Number, required: true },
    title: { type: String, required: true },
    snippet: { type: String, default: '' },
    link: { type: String, default: '' },
    domainHost: { type: String, default: '' },
    badge: { type: String, enum: ['OWN', 'UNKNOWN'], default: 'UNKNOWN' },
    matchType: { type: String, default: 'none' },
    matchedBrand: {
      _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
      code: { type: String },
      name: { type: String },
      color: { type: String },
    },
    matchedDomain: {
      _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Domain' },
      domain: { type: String },
      domainHostKey: { type: String },
      domainRootKey: { type: String },
    },
  },
  { _id: false }
);

const serpRunSchema = new mongoose.Schema(
  {
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
    query: { type: String, required: true, trim: true },
    trigger: { type: String, enum: ['manual', 'auto'], required: true, index: true },
    checkedAt: { type: Date, default: Date.now, index: true },
    params: {
      gl: { type: String, default: 'id' },
      hl: { type: String, default: 'id' },
      num: { type: Number, default: 10 },
      device: { type: String, default: 'desktop' },
    },
    keyId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    keyName: { type: String, default: '' },
    keyRemaining: { type: Number, default: null },
    ownCount: { type: Number, default: 0 },
    unknownCount: { type: Number, default: 0 },
    bestOwnRank: { type: Number, default: null },
    results: { type: [serpResultItemSchema], default: [] },
  },
  {
    timestamps: true,
  }
);

serpRunSchema.index({ brand: 1, checkedAt: -1 });

module.exports = mongoose.model('SerpRun', serpRunSchema);
