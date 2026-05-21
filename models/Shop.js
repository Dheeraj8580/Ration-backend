const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  shopCode: { type: String, required: true, unique: true, uppercase: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  address: { type: String, default: '' },
  district: { type: String, default: '' },
  state: { type: String, default: '' },
  pincode: { type: String, default: '' },
  phone: { type: String, default: '' },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Suspended'],
    default: 'Pending',
  },
  rejectionReason: { type: String, default: '' },
  lowStockThresholdKg: { type: Number, default: 50 },
}, { timestamps: true });

module.exports = mongoose.model('Shop', shopSchema);
