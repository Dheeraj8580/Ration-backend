const express = require('express');
const User = require('../models/User');
const Shop = require('../models/Shop');
const ShopStock = require('../models/ShopStock');
const Distribution = require('../models/Distribution');
const VerificationCode = require('../models/VerificationCode');
const Complaint = require('../models/Complaint');
const { protect, shopOwnerOnly } = require('../middleware/authMiddleware');
const {
  getCurrentMonth,
  getQuotaForUser,
  generateReceiptId,
} = require('../utils/quotaCalculator');

const router = express.Router();

router.use(protect, shopOwnerOnly);

const getOwnerShop = async (userId) => {
  const shop = await Shop.findOne({ owner: userId, status: 'Approved' });
  return shop;
};

// GET /api/shop/me — shop profile + stock
router.get('/me', async (req, res) => {
  try {
    const shop = await getOwnerShop(req.user._id);
    if (!shop) {
      return res.status(404).json({ success: false, message: 'No approved shop linked to your account.' });
    }
    let stock = await ShopStock.findOne({ shop: shop._id });
    if (!stock) {
      stock = await ShopStock.create({ shop: shop._id });
    }
    const lowStock =
      stock.riceKg < shop.lowStockThresholdKg ||
      stock.wheatKg < shop.lowStockThresholdKg ||
      stock.sugarKg < shop.lowStockThresholdKg;

    res.json({
      success: true,
      shop,
      stock,
      alerts: lowStock
        ? [{ type: 'low_stock', message: 'One or more commodities are below threshold.' }]
        : [],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/shop/stock — update stock / record supply
router.put('/stock', async (req, res) => {
  try {
    const shop = await getOwnerShop(req.user._id);
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found.' });

    const { riceKg, wheatKg, sugarKg, supplyNote, mode } = req.body;
    let stock = await ShopStock.findOne({ shop: shop._id });
    if (!stock) stock = await ShopStock.create({ shop: shop._id });

    if (mode === 'add_supply') {
      stock.riceKg += Number(riceKg) || 0;
      stock.wheatKg += Number(wheatKg) || 0;
      stock.sugarKg += Number(sugarKg) || 0;
      stock.lastSupplyDate = new Date();
      stock.lastSupplyNote = supplyNote || 'Supply received';
    } else {
      if (riceKg != null) stock.riceKg = Number(riceKg);
      if (wheatKg != null) stock.wheatKg = Number(wheatKg);
      if (sugarKg != null) stock.sugarKg = Number(sugarKg);
    }

    await stock.save();
    res.json({ success: true, stock });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/shop/verify — verify citizen by ration card + OTP
router.post('/verify', async (req, res) => {
  try {
    const { rationCardNumber, otp, aadhaarNumber } = req.body;
    const month = getCurrentMonth();

    const citizen = await User.findOne({
      role: 'user',
      applicationStatus: 'Approved',
      rationCardNumber: rationCardNumber?.trim(),
    });

    if (!citizen) {
      return res.status(404).json({ success: false, message: 'Invalid ration card number or not approved.' });
    }

    if (aadhaarNumber && citizen.aadhaarNumber !== aadhaarNumber.replace(/\s/g, '')) {
      return res.status(400).json({ success: false, message: 'Aadhaar does not match this ration card.' });
    }

    if (otp) {
      const record = await VerificationCode.findOne({
        user: citizen._id,
        month,
        code: String(otp),
        usedAt: null,
        expiresAt: { $gt: new Date() },
      });
      if (!record) {
        return res.status(400).json({ success: false, message: 'Invalid or expired OTP.' });
      }
    }

    const existing = await Distribution.findOne({ user: citizen._id, month });
    const quota = await getQuotaForUser(citizen);

    res.json({
      success: true,
      verified: true,
      citizen: {
        id: citizen._id.toString(),
        name: citizen.name,
        rationCardNumber: citizen.rationCardNumber,
        aadhaarNumber: citizen.aadhaarNumber,
        rationCardType: citizen.rationCardType,
        familyMembersCount: citizen.familyMembersCount,
        address: citizen.address,
        profilePhoto: citizen.profilePhoto,
      },
      quota,
      alreadyCollected: !!existing,
      collection: existing || null,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/shop/distribute — issue monthly ration
router.post('/distribute', async (req, res) => {
  try {
    const shop = await getOwnerShop(req.user._id);
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found.' });

    const { rationCardNumber, otp, verificationMethod = 'OTP' } = req.body;
    const month = getCurrentMonth();

    const citizen = await User.findOne({
      role: 'user',
      applicationStatus: 'Approved',
      rationCardNumber: rationCardNumber?.trim(),
    });
    if (!citizen) {
      return res.status(404).json({ success: false, message: 'Citizen not found.' });
    }

    const already = await Distribution.findOne({ user: citizen._id, month });
    if (already) {
      return res.status(400).json({
        success: false,
        message: 'Ration already collected this month.',
        receiptId: already.receiptId,
      });
    }

    if (otp) {
      const record = await VerificationCode.findOne({
        user: citizen._id,
        month,
        code: String(otp),
        usedAt: null,
        expiresAt: { $gt: new Date() },
      });
      if (!record) {
        return res.status(400).json({ success: false, message: 'Invalid or expired OTP.' });
      }
      record.usedAt = new Date();
      record.usedByShop = shop._id;
      await record.save();
    }

    const quotaInfo = await getQuotaForUser(citizen);
    if (!quotaInfo) {
      return res.status(400).json({ success: false, message: 'No quota schema for card type.' });
    }

    const { riceKg, wheatKg, sugarKg } = quotaInfo.allocated;
    let stock = await ShopStock.findOne({ shop: shop._id });
    if (!stock) stock = await ShopStock.create({ shop: shop._id });

    if (stock.riceKg < riceKg || stock.wheatKg < wheatKg || stock.sugarKg < sugarKg) {
      return res.status(400).json({ success: false, message: 'Insufficient shop stock for this distribution.' });
    }

    stock.riceKg -= riceKg;
    stock.wheatKg -= wheatKg;
    stock.sugarKg -= sugarKg;
    await stock.save();

    const distribution = await Distribution.create({
      user: citizen._id,
      shop: shop._id,
      issuedBy: req.user._id,
      month,
      rationCardNumber: citizen.rationCardNumber,
      cardType: citizen.rationCardType,
      familyMembersCount: citizen.familyMembersCount,
      riceKg,
      wheatKg,
      sugarKg,
      receiptId: generateReceiptId(),
      verificationMethod,
    });

    res.status(201).json({
      success: true,
      message: 'Ration distributed successfully.',
      distribution,
      stock,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Ration already collected this month.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/shop/transactions
router.get('/transactions', async (req, res) => {
  try {
    const shop = await getOwnerShop(req.user._id);
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found.' });

    const { month } = req.query;
    const filter = { shop: shop._id };
    if (month) filter.month = month;

    const transactions = await Distribution.find(filter)
      .populate('user', 'name rationCardNumber mobile')
      .sort({ createdAt: -1 })
      .limit(200);

    const summary = await Distribution.aggregate([
      { $match: { shop: shop._id, ...(month ? { month } : {}) } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          riceKg: { $sum: '$riceKg' },
          wheatKg: { $sum: '$wheatKg' },
          sugarKg: { $sum: '$sugarKg' },
        },
      },
    ]);

    res.json({
      success: true,
      transactions,
      summary: summary[0] || { count: 0, riceKg: 0, wheatKg: 0, sugarKg: 0 },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/shop/complaints
router.get('/complaints', async (req, res) => {
  try {
    const shop = await getOwnerShop(req.user._id);
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found.' });

    const complaints = await Complaint.find({ shop: shop._id })
      .populate('user', 'name email mobile rationCardNumber')
      .sort({ createdAt: -1 });

    res.json({ success: true, complaints });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/shop/complaints/:id/reply
router.put('/complaints/:id/reply', async (req, res) => {
  try {
    const shop = await getOwnerShop(req.user._id);
    const { shopReply } = req.body;
    const complaint = await Complaint.findOne({ _id: req.params.id, shop: shop._id });
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });

    complaint.shopReply = shopReply;
    complaint.status = 'shop_replied';
    await complaint.save();
    res.json({ success: true, complaint });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
