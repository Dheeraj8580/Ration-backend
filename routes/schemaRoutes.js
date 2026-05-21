const express = require('express');
const RationQuotaSchema = require('../models/RationQuotaSchema');
const { protect, adminOnly } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect, adminOnly);

router.get('/', async (req, res) => {
  try {
    const schemas = await RationQuotaSchema.find().sort({ cardType: 1 });
    res.json({ success: true, schemas });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:cardType', async (req, res) => {
  try {
    const { cardType } = req.params;
    const { riceKgPerMember, wheatKgPerMember, sugarKgPerMember, label, description, isActive } = req.body;

    const schema = await RationQuotaSchema.findOneAndUpdate(
      { cardType },
      {
        riceKgPerMember,
        wheatKgPerMember,
        sugarKgPerMember,
        label,
        description,
        isActive,
        updatedBy: req.user._id,
      },
      { new: true, runValidators: true }
    );

    if (!schema) {
      return res.status(404).json({ success: false, message: 'Schema not found.' });
    }

    res.json({ success: true, schema });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
