const mongoose = require('mongoose');

const DOMAIN_ACTIVITY_ACTIONS = {
  ADD: 'add',
  DELETE: 'delete',
  AUTO_START: 'auto_start',
  AUTO_STOP: 'auto_stop',
  AUTO_CHECK: 'auto_check',
};

const domainActivityLogSchema = new mongoose.Schema(
  {
    action: { type: String, enum: Object.values(DOMAIN_ACTIVITY_ACTIONS), required: true, index: true },
    domain: { type: String, default: '', trim: true },
    domainHostKey: { type: String, default: '', trim: true, index: true },
    note: { type: String, default: '' },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null, index: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    metadata: { type: Object, default: {} },
  },
  {
    timestamps: true,
  }
);

domainActivityLogSchema.index({ createdAt: -1 });

module.exports = {
  DomainActivityLog: mongoose.model('DomainActivityLog', domainActivityLogSchema),
  DOMAIN_ACTIVITY_ACTIONS,
};
