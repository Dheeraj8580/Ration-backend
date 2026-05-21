const express = require('express');
const User = require('../models/User');
const Distribution = require('../models/Distribution');
const Complaint = require('../models/Complaint');
const VerificationCode = require('../models/VerificationCode');
const Shop = require('../models/Shop');
const { protect } = require('../middleware/authMiddleware');
const { getCurrentMonth, getQuotaForUser, generateOtp } = require('../utils/quotaCalculator');

const router = express.Router();

router.use(protect);

// GET /api/user/quota — monthly quota & collection status
router.get('/quota', async (req, res) => {
  try {
    if (req.user.role !== 'user') {
      return res.status(403).json({ success: false, message: 'Citizens only.' });
    }
    if (req.user.applicationStatus !== 'Approved' || !req.user.rationCardNumber) {
      return res.status(400).json({
        success: false,
        message: 'Ration card not approved yet.',
      });
    }

    const month = getCurrentMonth();
    const quota = await getQuotaForUser(req.user);
    const collection = await Distribution.findOne({ user: req.user._id, month })
      .populate('shop', 'name shopCode district');

    const remaining = quota && !collection
      ? quota.allocated
      : collection
        ? { riceKg: 0, wheatKg: 0, sugarKg: 0 }
        : null;

    res.json({
      success: true,
      month,
      quota,
      collected: !!collection,
      collection,
      remaining,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/user/otp — generate OTP for shop verification
router.post('/otp', async (req, res) => {
  try {
    if (req.user.role !== 'user') {
      return res.status(403).json({ success: false, message: 'Citizens only.' });
    }
    if (req.user.applicationStatus !== 'Approved') {
      return res.status(400).json({ success: false, message: 'Card not approved.' });
    }

    const month = getCurrentMonth();
    const existing = await Distribution.findOne({ user: req.user._id, month });
    if (existing) {
      return res.status(400).json({ success: false, message: 'You already collected ration this month.' });
    }

    await VerificationCode.deleteMany({ user: req.user._id, month, usedAt: null });

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await VerificationCode.create({
      user: req.user._id,
      code,
      month,
      expiresAt,
    });

    res.json({
      success: true,
      otp: code,
      expiresAt,
      message: 'Share this OTP with the ration shop. Valid for 15 minutes.',
      qrPayload: JSON.stringify({
        rationCardNumber: req.user.rationCardNumber,
        month,
        otp: code,
      }),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/user/transactions
router.get('/transactions', async (req, res) => {
  try {
    if (req.user.role !== 'user') {
      return res.status(403).json({ success: false, message: 'Citizens only.' });
    }

    const transactions = await Distribution.find({ user: req.user._id })
      .populate('shop', 'name shopCode district address')
      .sort({ createdAt: -1 })
      .limit(24);

    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/user/complaints
router.post('/complaints', async (req, res) => {
  try {
    if (req.user.role !== 'user') {
      return res.status(403).json({ success: false, message: 'Citizens only.' });
    }

    const { category, subject, message, shopId } = req.body;
    if (!subject?.trim() || !message?.trim()) {
      return res.status(400).json({ success: false, message: 'Subject and message required.' });
    }

    const complaint = await Complaint.create({
      user: req.user._id,
      shop: shopId || undefined,
      category: category || 'not_received',
      subject: subject.trim(),
      message: message.trim(),
      month: getCurrentMonth(),
    });

    res.status(201).json({ success: true, complaint });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/user/complaints
router.get('/complaints', async (req, res) => {
  try {
    if (req.user.role !== 'user') {
      return res.status(403).json({ success: false, message: 'Citizens only.' });
    }

    const complaints = await Complaint.find({ user: req.user._id })
      .populate('shop', 'name shopCode')
      .sort({ createdAt: -1 });

    res.json({ success: true, complaints });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/user/shops — list approved shops (for complaint targeting)
router.get('/shops', async (req, res) => {
  try {
    const shops = await Shop.find({ status: 'Approved' }).select('name shopCode district state');
    res.json({ success: true, shops });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
