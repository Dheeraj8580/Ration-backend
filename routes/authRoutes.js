const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Shop = require('../models/Shop');
const ShopStock = require('../models/ShopStock');
const { sendAdminLoginNotification } = require('../utils/sendEmail');
const { determineRationCardType } = require('../utils/rationLogic');
const { protect } = require('../middleware/authMiddleware');
const { profilePhotoUpload, applicationUpload, filePath } = require('../middleware/upload');

const formatUserResponse = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  mobile: user.mobile,
  address: user.address,
  dateOfBirth: user.dateOfBirth,
  aadhaarNumber: user.aadhaarNumber,
  familyMembersCount: user.familyMembersCount,
  occupation: user.occupation,
  annualIncome: user.annualIncome,
  state: user.state,
  district: user.district,
  rationCardType: user.rationCardType,
  rationCardNumber: user.rationCardNumber,
  applicationStatus:
    user.applicationStatus || (user.rationCardNumber ? 'Approved' : 'NotSubmitted'),
  isApplicationFeePaid: user.isApplicationFeePaid || false,
  paymentId: user.paymentId || '',
  paymentDate: user.paymentDate || null,
  applicationSubmittedAt: user.applicationSubmittedAt,
  rejectionReason: user.rejectionReason,
  approvalDate: user.approvalDate,
  profilePhoto: user.profilePhoto || '',
  documents: user.documents || {},
  fatherName: user.fatherName || '',
  motherName: user.motherName || '',
  gender: user.gender || '',
  maritalStatus: user.maritalStatus || '',
  pincode: user.pincode || '',
  familyMembers: user.familyMembers || [],
  shopId: user.shopId?.toString?.() || user.shopId || '',
  shopOwnerStatus: user.shopOwnerStatus || '',
  department: user.department,
  permissions: user.permissions,
  createdAt: user.createdAt,
});

// @route   POST /api/auth/login
// @desc    Authenticate user (admin or user)
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // Validate inputs
    if (!email || !password || !role) {
      return res.status(400).json({ success: false, message: 'Please provide email, password, and role.' });
    }

    // Find user in MongoDB
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Check role matches what the user selected on the login page
    if (user.role !== role) {
      return res.status(403).json({
        success: false,
        message: `Access denied. This account is not registered as a ${role}.`,
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // If admin login, send email notification (non-blocking)
    if (user.role === 'admin') {
      sendAdminLoginNotification(user.email, user.name);
    }

    res.status(200).json({
      success: true,
      token,
      user: formatUserResponse(user),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// @route   POST /api/auth/register
// @desc    Register a new user (public)
// @access  Public
router.post('/register', profilePhotoUpload, async (req, res) => {
  try {
    const { 
      name, email, password, mobile, address, dateOfBirth, 
      aadhaarNumber, familyMembersCount, occupation, annualIncome, 
      state, district 
    } = req.body;

    if (!name || !email || !password || !mobile || !aadhaarNumber || !annualIncome) {
      return res.status(400).json({ success: false, message: 'All required fields must be provided.' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Profile photo is required for your ration card.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const dupAadhaar = await User.findOne({ aadhaarNumber, role: 'user' });
    if (dupAadhaar) {
      return res.status(409).json({ success: false, message: 'This Aadhaar is already registered.' });
    }

    const income = Number(annualIncome);
    const familyCount = Number(familyMembersCount);

    const newUser = new User({
      name,
      email: email.toLowerCase(),
      password,
      mobile,
      address,
      dateOfBirth,
      aadhaarNumber,
      familyMembersCount: familyCount,
      occupation,
      annualIncome: income,
      state,
      district,
      rationCardType: determineRationCardType(income, familyCount),
      applicationStatus: 'NotSubmitted',
      role: 'user',
      profilePhoto: filePath(req.file),
    });

    await newUser.save();

    const token = jwt.sign(
      { id: newUser._id, role: newUser.role, email: newUser.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      token,
      user: formatUserResponse(newUser),
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// @route   POST /api/auth/apply — submit / update ration application (logged-in user)
router.post('/apply', protect, applicationUpload, async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      return res.status(403).json({ success: false, message: 'Admins cannot submit applications.' });
    }

    const files = req.files || {};
    if (!files.photo?.[0] || !files.idProof?.[0] || !files.addressProof?.[0]) {
      return res.status(400).json({
        success: false,
        message: 'Photo, identity proof, and address proof are required.',
      });
    }

    const {
      name, mobile, address, dateOfBirth, aadhaarNumber,
      familyMembersCount, occupation, annualIncome, state, district,
      fatherName, motherName, gender, maritalStatus, pincode, cardType,
      familyMembers: familyMembersRaw,
      paymentId, isFeePaid,
    } = req.body;

    if (!fatherName?.trim() || !motherName?.trim() || !gender || !maritalStatus) {
      return res.status(400).json({
        success: false,
        message: "Father's name, mother's name, gender, and marital status are required.",
      });
    }

    const income = Number(annualIncome ?? req.user.annualIncome);
    const family = Number(familyMembersCount ?? req.user.familyMembersCount);

    let familyMembers = [];
    if (familyMembersRaw) {
      try {
        familyMembers = typeof familyMembersRaw === 'string'
          ? JSON.parse(familyMembersRaw)
          : familyMembersRaw;
      } catch {
        return res.status(400).json({ success: false, message: 'Invalid family members data.' });
      }
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    if (user.applicationStatus === 'Approved' && user.rationCardNumber) {
      return res.status(400).json({ success: false, message: 'You already have an approved ration card.' });
    }

    if (
      user.applicationStatus === 'Pending' &&
      user.applicationSubmittedAt &&
      user.documents?.idProof
    ) {
      return res.status(400).json({
        success: false,
        message: 'Your application is already submitted and awaiting admin approval.',
      });
    }

    if (name) user.name = name;
    if (mobile) user.mobile = mobile;
    if (address) user.address = address;
    if (dateOfBirth) user.dateOfBirth = dateOfBirth;
    if (aadhaarNumber) user.aadhaarNumber = aadhaarNumber;
    if (familyMembersCount) user.familyMembersCount = family;
    if (occupation) user.occupation = occupation;
    if (annualIncome != null) user.annualIncome = income;
    if (state) user.state = state;
    if (district) user.district = district;
    user.fatherName = fatherName.trim();
    user.motherName = motherName.trim();
    user.gender = gender;
    user.maritalStatus = maritalStatus;
    if (pincode) user.pincode = pincode;
    if (Array.isArray(familyMembers) && familyMembers.length) {
      user.familyMembers = familyMembers;
      user.familyMembersCount = familyMembers.length;
    }

    user.profilePhoto = filePath(files.photo[0]) || user.profilePhoto;
    user.documents = {
      idProof: filePath(files.idProof[0]),
      addressProof: filePath(files.addressProof[0]),
      incomeProof: files.incomeProof?.[0] ? filePath(files.incomeProof[0]) : user.documents?.incomeProof || '',
    };

    const cardTypeMap = { 
      phh: 'BPL', nphh: 'APL', aay: 'Antyodaya', 
      apl: 'APL', bpl: 'BPL', antyodaya: 'Antyodaya',
      APL: 'APL', BPL: 'BPL', Antyodaya: 'Antyodaya' 
    };
    user.rationCardType = cardTypeMap[cardType] || cardTypeMap[cardType?.toLowerCase?.()] || determineRationCardType(income, family);
    user.applicationStatus = 'Pending';
    user.applicationSubmittedAt = new Date();
    user.rejectionReason = '';
    if (user.applicationStatus === 'Rejected') {
      user.set('rationCardNumber', undefined);
    }

    if (isFeePaid === 'true' || isFeePaid === true || paymentId) {
      user.isApplicationFeePaid = true;
      user.paymentId = paymentId || `pay_simulated_${Date.now()}`;
      user.paymentDate = new Date();
    }

    await user.save();

    res.json({
      success: true,
      message: 'Application submitted. Awaiting admin approval.',
      user: formatUserResponse(user),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── ADMIN & PROTECTED ROUTES ──────────────────────────────────────────────────
const { adminOnly } = require('../middleware/authMiddleware');

// @route   GET /api/auth/users
// @desc    Get all users (Admin only)
router.get('/users', protect, adminOnly, async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching users.' });
  }
});

// @route   PUT /api/auth/update-card/:id
// @desc    Update user ration card type
router.put('/update-card/:id', protect, async (req, res) => {
  try {
    const { rationCardType } = req.body;
    
    // Check if updating own card or if admin
    if (req.user._id.toString() !== req.params.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { rationCardType },
      { new: true }
    ).select('-password');

    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Update failed.' });
  }
});

// @route   DELETE /api/auth/user/:id
// @desc    Delete a user (Admin only)
router.delete('/user/:id', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, message: 'User deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Delete failed.' });
  }
});

// @route   POST /api/auth/register-shop — ration shop owner registration
router.post('/register-shop', async (req, res) => {
  try {
    const {
      ownerName, email, password, mobile, shopName, shopCode,
      address, district, state, pincode,
    } = req.body;

    if (!ownerName || !email || !password || !shopName || !shopCode) {
      return res.status(400).json({ success: false, message: 'Owner, email, password, shop name and shop code are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    const codeExists = await Shop.findOne({ shopCode: shopCode.toUpperCase() });
    if (codeExists) {
      return res.status(409).json({ success: false, message: 'Shop code already in use.' });
    }

    const shop = await Shop.create({
      name: shopName,
      shopCode: shopCode.toUpperCase(),
      address: address || '',
      district: district || '',
      state: state || '',
      pincode: pincode || '',
      phone: mobile || '',
      status: 'Pending',
    });

    const owner = await User.create({
      name: ownerName,
      email: email.toLowerCase(),
      password,
      mobile: mobile || '',
      role: 'shop_owner',
      shopId: shop._id,
      shopOwnerStatus: 'Pending',
    });

    shop.owner = owner._id;
    await shop.save();
    await ShopStock.create({ shop: shop._id, riceKg: 0, wheatKg: 0, sugarKg: 0 });

    const token = jwt.sign(
      { id: owner._id, role: owner.role, email: owner.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Shop registration submitted. Await admin approval.',
      token,
      user: formatUserResponse(owner),
    });
  } catch (error) {
    console.error('Shop register error:', error);
    res.status(500).json({ success: false, message: error.message || 'Registration failed.' });
  }
});

// @route   GET /api/auth/me
// @desc    Get current logged-in user (protected)
router.get('/me', protect, async (req, res) => {
  try {
    res.json({ success: true, user: formatUserResponse(req.user) });
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token.' });
  }
});

// @route   GET /api/auth/ration-card/:cardNumber
// @desc    Get user's ration card by card number (public)
router.get('/ration-card/:cardNumber', async (req, res) => {
  try {
    const { cardNumber } = req.params;
    if (!cardNumber) {
      return res.status(400).json({ success: false, message: 'Ration card number is required.' });
    }

    const user = await User.findOne({
      rationCardNumber: cardNumber.toUpperCase().trim(),
      applicationStatus: 'Approved',
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No approved ration card found with this number.',
      });
    }

    res.json({ success: true, user: formatUserResponse(user) });
  } catch (error) {
    console.error('Ration card query error:', error);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

module.exports = router;
