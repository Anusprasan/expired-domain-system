const mongoose = require('mongoose');
const { buildDomainKeys } = require('../utils/domain');

const domainSchema = new mongoose.Schema(
  {
    domain: { type: String, required: true, trim: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
    note: { type: String, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    domainHostKey: { type: String, required: true, index: true },
    domainRootKey: { type: String, required: true, index: true },
    tokens: [{ type: String, index: true }],
    createdBy: { type: mongoose.Schema.Types.ObjectId },
    updatedBy: { type: mongoose.Schema.Types.ObjectId },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.uptime;
        delete ret.nawala;
        delete ret.cloudflare;
        delete ret.google;
        return ret;
      },
    },
  }
);

domainSchema.pre('validate', function deriveDomainKeys(next) {
  if (!this.domain) {
    return next();
  }

  const keys = buildDomainKeys({ domain: this.domain });
  this.domainHostKey = keys.domainHostKey;
  this.domainRootKey = keys.domainRootKey;
  this.tokens = [...new Set([...(this.tokens || []), ...keys.tokens])];
  return next();
});

domainSchema.index({ brand: 1, domain: 1 }, { unique: true });

module.exports = mongoose.model('Domain', domainSchema);
