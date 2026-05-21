const mongoose = require('mongoose');

const verificationCodeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  code: { type: String, required: true },
  month: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date },
  usedByShop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
}, { timestamps: true });

verificationCodeSchema.index({ user: 1, month: 1, usedAt: 1 });

module.exports = mongoose.model('VerificationCode', verificationCodeSchema);
