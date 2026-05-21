const mongoose = require('mongoose');

const shopStockSchema = new mongoose.Schema({
  shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  riceKg: { type: Number, default: 0, min: 0 },
  wheatKg: { type: Number, default: 0, min: 0 },
  sugarKg: { type: Number, default: 0, min: 0 },
  lastSupplyDate: { type: Date },
  lastSupplyNote: { type: String, default: '' },
}, { timestamps: true });

shopStockSchema.index({ shop: 1 }, { unique: true });

module.exports = mongoose.model('ShopStock', shopStockSchema);
