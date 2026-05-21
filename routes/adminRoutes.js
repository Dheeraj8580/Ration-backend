const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Shop = require('../models/Shop');
const ShopStock = require('../models/ShopStock');
const Distribution = require('../models/Distribution');
const Complaint = require('../models/Complaint');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { determineRationCardType, generateRationCardNumber } = require('../utils/rationLogic');
const { getCurrentMonth } = require('../utils/quotaCalculator');

router.use(protect, adminOnly);

const mapApplication = (user) => {
  let status = user.applicationStatus || 'NotSubmitted';
  if (!user.applicationStatus && user.rationCardNumber) status = 'Approved';
  const hasDocuments = !!(user.documents?.idProof && user.documents?.addressProof);
  const hasSubmitted = !!user.applicationSubmittedAt || hasDocuments;

  return {
    id: user._id.toString(),
    applicant: user.name,
    email: user.email,
    phone: user.mobile,
    type: `Ration Card - ${user.rationCardType || 'APL'}`,
    submittedDate: user.applicationSubmittedAt
      ? new Date(user.applicationSubmittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : '—',
    status: status.toLowerCase(),
    aadhaar: user.aadhaarNumber,
    address: `${user.address || ''}${user.district ? `, ${user.district}` : ''}${user.state ? `, ${user.state}` : ''}`,
    rationCardType: user.rationCardType,
    rationCardNumber: user.rationCardNumber,
    annualIncome: user.annualIncome,
    familyMembersCount: user.familyMembersCount,
    occupation: user.occupation,
    rejectionReason: user.rejectionReason,
    fatherName: user.fatherName,
    motherName: user.motherName,
    gender: user.gender,
    maritalStatus: user.maritalStatus,
    familyMembers: user.familyMembers || [],
    hasSubmitted,
    documents: user.documents || {},
    profilePhoto: user.profilePhoto,
  };
};

// GET /api/admin/applications
router.get('/applications', async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = { role: 'user' };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { mobile: { $regex: search, $options: 'i' } },
        { aadhaarNumber: { $regex: search, $options: 'i' } },
      ];
    }

    let users = await User.find(filter).sort({ createdAt: -1 }).select('-password');

    let applications = users
      .map(mapApplication)
      .filter((a) => a.hasSubmitted || a.status === 'approved' || a.status === 'rejected');

    if (status && status !== 'all') {
      applications = applications.filter((a) => a.status === status.toLowerCase());
    }

    res.json({ success: true, count: applications.length, applications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const users = await User.find({ role: 'user' });
    const apps = users.map(mapApplication);
    res.json({
      success: true,
      stats: {
        total: apps.length,
        pending: apps.filter((a) => a.status === 'pending').length,
        approved: apps.filter((a) => a.status === 'approved').length,
        rejected: apps.filter((a) => a.status === 'rejected').length,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/admin/applications/:id/approve
router.put('/applications/:id/approve', async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, role: 'user' });
    if (!user) return res.status(404).json({ success: false, message: 'Application not found.' });

    if (user.applicationStatus !== 'Pending') {
      return res.status(400).json({ success: false, message: 'Only pending applications can be approved.' });
    }
    if (!user.documents?.idProof || !user.documents?.addressProof) {
      return res.status(400).json({
        success: false,
        message: 'Applicant must submit documents before approval.',
      });
    }

    const rationCardType =
      req.body.rationCardType ||
      determineRationCardType(user.annualIncome, user.familyMembersCount);

    user.applicationStatus = 'Approved';
    user.rejectionReason = '';
    user.approvalDate = new Date();
    user.rationCardType = rationCardType;
    if (!user.rationCardNumber) {
      user.rationCardNumber = generateRationCardNumber(user.state);
    }

    await user.save();

    res.json({ success: true, message: 'Application approved.', application: mapApplication(user) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(500).json({ success: false, message: 'Card number conflict. Retry.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/admin/applications/:id/reject
router.put('/applications/:id/reject', async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason?.trim()) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
    }

    const user = await User.findOne({ _id: req.params.id, role: 'user' });
    if (!user) return res.status(404).json({ success: false, message: 'Application not found.' });

    user.applicationStatus = 'Rejected';
    user.rejectionReason = rejectionReason.trim();
    user.approvalDate = undefined;
    await user.save();

    res.json({ success: true, message: 'Application rejected.', application: mapApplication(user) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── Shop owners ─────────────────────────────────────────────────────────────

router.get('/shop-owners', async (req, res) => {
  try {
    const owners = await User.find({ role: 'shop_owner' })
      .select('-password')
      .populate('shopId');
    res.json({ success: true, shopOwners: owners });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/shop-owners/:id/approve', async (req, res) => {
  try {
    const owner = await User.findOne({ _id: req.params.id, role: 'shop_owner' });
    if (!owner) return res.status(404).json({ success: false, message: 'Shop owner not found.' });

    owner.shopOwnerStatus = 'Approved';
    await owner.save();

    const shop = await Shop.findById(owner.shopId);
    if (shop) {
      shop.status = 'Approved';
      shop.rejectionReason = '';
      await shop.save();
    }

    res.json({ success: true, message: 'Shop owner approved.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/shop-owners/:id/reject', async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    const owner = await User.findOne({ _id: req.params.id, role: 'shop_owner' });
    if (!owner) return res.status(404).json({ success: false, message: 'Shop owner not found.' });

    owner.shopOwnerStatus = 'Rejected';
    await owner.save();

    const shop = await Shop.findById(owner.shopId);
    if (shop) {
      shop.status = 'Rejected';
      shop.rejectionReason = rejectionReason || '';
      await shop.save();
    }

    res.json({ success: true, message: 'Shop owner rejected.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/shops', async (req, res) => {
  try {
    const shops = await Shop.find().populate('owner', 'name email mobile').sort({ createdAt: -1 });
    const stocks = await ShopStock.find();
    const stockMap = Object.fromEntries(stocks.map((s) => [s.shop.toString(), s]));

    const enriched = shops.map((sh) => ({
      ...sh.toObject(),
      stock: stockMap[sh._id.toString()] || null,
      lowStock: stockMap[sh._id.toString()]
        ? stockMap[sh._id.toString()].riceKg < sh.lowStockThresholdKg
        : false,
    }));

    res.json({ success: true, shops: enriched });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Duplicate / fake entry detection
router.get('/duplicates', async (req, res) => {
  try {
    const users = await User.find({ role: 'user', aadhaarNumber: { $ne: '' } });
    const byAadhaar = {};
    users.forEach((u) => {
      const key = u.aadhaarNumber;
      if (!byAadhaar[key]) byAadhaar[key] = [];
      byAadhaar[key].push({ id: u._id, name: u.name, email: u.email, rationCardNumber: u.rationCardNumber });
    });
    const duplicateAadhaar = Object.entries(byAadhaar)
      .filter(([, list]) => list.length > 1)
      .map(([aadhaar, entries]) => ({ aadhaar, entries }));

    const byCard = {};
    users.forEach((u) => {
      if (!u.rationCardNumber) return;
      if (!byCard[u.rationCardNumber]) byCard[u.rationCardNumber] = [];
      byCard[u.rationCardNumber].push({ id: u._id, name: u.name, email: u.email });
    });
    const duplicateCards = Object.entries(byCard)
      .filter(([, list]) => list.length > 1)
      .map(([rationCardNumber, entries]) => ({ rationCardNumber, entries }));

    res.json({
      success: true,
      duplicateAadhaar,
      duplicateCards,
      suspiciousCount: duplicateAadhaar.length + duplicateCards.length,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Reports & analytics
router.get('/reports/distribution', async (req, res) => {
  try {
    const month = req.query.month || getCurrentMonth();
    const distributions = await Distribution.find({ month })
      .populate('user', 'name district state rationCardType')
      .populate('shop', 'name shopCode district');

    const byDistrict = {};
    distributions.forEach((d) => {
      const dist = d.shop?.district || d.user?.district || 'Unknown';
      if (!byDistrict[dist]) {
        byDistrict[dist] = { count: 0, riceKg: 0, wheatKg: 0, sugarKg: 0 };
      }
      byDistrict[dist].count += 1;
      byDistrict[dist].riceKg += d.riceKg;
      byDistrict[dist].wheatKg += d.wheatKg;
      byDistrict[dist].sugarKg += d.sugarKg;
    });

    res.json({
      success: true,
      month,
      totalDistributions: distributions.length,
      byDistrict,
      distributions,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/complaints', async (req, res) => {
  try {
    const complaints = await Complaint.find()
      .populate('user', 'name email rationCardNumber')
      .populate('shop', 'name shopCode')
      .sort({ createdAt: -1 });
    res.json({ success: true, complaints });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/complaints/:id', async (req, res) => {
  try {
    const { status, adminReply } = req.body;
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Not found.' });

    if (status) complaint.status = status;
    if (adminReply) complaint.adminReply = adminReply;
    await complaint.save();
    res.json({ success: true, complaint });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
