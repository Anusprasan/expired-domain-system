const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, index: true },
    description: { type: String, default: '' },
    color: { type: String, default: '#2563eb' },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId },
  },
  {
    timestamps: true,
  }
);

brandSchema.index({ code: 1 }, { unique: true });

module.exports = mongoose.model('Brand', brandSchema);
