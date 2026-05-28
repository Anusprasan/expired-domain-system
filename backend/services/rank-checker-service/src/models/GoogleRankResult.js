const mongoose = require('mongoose');

const googleRankResultItemSchema = new mongoose.Schema(
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

const googleRankResultSchema = new mongoose.Schema(
  {
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
    query: { type: String, required: true, trim: true },
    trigger: { type: String, enum: ['manual', 'auto'], default: 'auto', index: true },
    checkedAt: { type: Date, default: Date.now, index: true },
    params: {
      gl: { type: String, default: 'id' },
      hl: { type: String, default: 'id' },
      num: { type: Number, default: 10 },
      device: { type: String, default: 'desktop' },
    },
    keyId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    keyName: { type: String, default: '' },
    keyTotalRequests: { type: Number, default: 0 },
    keyMonthlyLimit: { type: Number, default: 250 },
    ownCount: { type: Number, default: 0 },
    unknownCount: { type: Number, default: 0 },
    bestOwnRank: { type: Number, default: null },
    results: { type: [googleRankResultItemSchema], default: [] },
  },
  {
    timestamps: true,
    collection: 'google-rank-results',
  }
);

googleRankResultSchema.index({ brand: 1, checkedAt: -1 });

module.exports = mongoose.model('GoogleRankResult', googleRankResultSchema);
