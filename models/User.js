const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  mobile: { type: String, default: '' },
  address: { type: String, default: '' },
  dateOfBirth: { type: Date },
  aadhaarNumber: { type: String, default: '' },
  fatherName: { type: String, default: '' },
  motherName: { type: String, default: '' },
  gender: { type: String, enum: ['male', 'female', 'other', ''], default: '' },
  maritalStatus: { type: String, enum: ['single', 'married', 'widowed', 'divorced', ''], default: '' },
  pincode: { type: String, default: '' },
  familyMembers: [
    {
      name: { type: String, default: '' },
      relation: { type: String, default: '' },
      age: { type: String, default: '' },
      aadhaar: { type: String, default: '' },
    },
  ],
  familyMembersCount: { type: Number, default: 1 },
  occupation: { type: String, default: '' },
  annualIncome: { type: Number, default: 0 },
  state: { type: String, default: '' },
  district: { type: String, default: '' },
  rationCardType: {
    type: String,
    enum: ['APL', 'BPL', 'Antyodaya'],
    default: 'APL',
  },
  rationCardNumber: { type: String, unique: true, sparse: true },
  applicationStatus: {
    type: String,
    enum: ['NotSubmitted', 'Pending', 'Approved', 'Rejected'],
    default: 'NotSubmitted',
  },
  isApplicationFeePaid: { type: Boolean, default: false },
  paymentId: { type: String, default: '' },
  paymentDate: { type: Date },
  applicationSubmittedAt: { type: Date },
  rejectionReason: { type: String, default: '' },
  approvalDate: { type: Date },
  profilePhoto: { type: String, default: '' },
  documents: {
    idProof: { type: String, default: '' },
    addressProof: { type: String, default: '' },
    incomeProof: { type: String, default: '' },
  },
  role: { type: String, enum: ['user', 'admin', 'shop_owner'], default: 'user' },
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
  shopOwnerStatus: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', ''],
    default: '',
  },
  department: { type: String, default: '' },
  permissions: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
});

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
