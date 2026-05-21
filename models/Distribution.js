const mongoose = require('mongoose');

const distributionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  month: { type: String, required: true }, // YYYY-MM
  rationCardNumber: { type: String, required: true },
  cardType: { type: String, enum: ['APL', 'BPL', 'Antyodaya'], required: true },
  familyMembersCount: { type: Number, required: true },
  riceKg: { type: Number, required: true },
  wheatKg: { type: Number, required: true },
  sugarKg: { type: Number, required: true },
  receiptId: { type: String, required: true, unique: true },
  verificationMethod: { type: String, enum: ['QR', 'OTP', 'MANUAL'], default: 'OTP' },
}, { timestamps: true });

distributionSchema.index({ user: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Distribution', distributionSchema);
