const mongoose = require('mongoose');

const rationQuotaSchema = new mongoose.Schema({
  cardType: {
    type: String,
    enum: ['APL', 'BPL', 'Antyodaya'],
    required: true,
    unique: true,
  },
  label: { type: String, required: true },
  description: { type: String, default: '' },
  /** kg per family member per month */
  riceKgPerMember: { type: Number, required: true, min: 0 },
  wheatKgPerMember: { type: Number, required: true, min: 0 },
  sugarKgPerMember: { type: Number, required: true, min: 0 },
  isActive: { type: Boolean, default: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('RationQuotaSchema', rationQuotaSchema);
