const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
  category: {
    type: String,
    enum: ['not_received', 'quality', 'quantity', 'shop_behavior', 'other'],
    default: 'not_received',
  },
  subject: { type: String, required: true },
  message: { type: String, required: true },
  status: {
    type: String,
    enum: ['open', 'shop_replied', 'admin_review', 'resolved', 'rejected'],
    default: 'open',
  },
  shopReply: { type: String, default: '' },
  adminReply: { type: String, default: '' },
  month: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Complaint', complaintSchema);
