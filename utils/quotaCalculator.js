const RationQuotaSchema = require('../models/RationQuotaSchema');

const getCurrentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const calculateQuota = (schema, familyMembersCount) => {
  const members = Math.max(1, Number(familyMembersCount) || 1);
  return {
    riceKg: Math.round(schema.riceKgPerMember * members * 100) / 100,
    wheatKg: Math.round(schema.wheatKgPerMember * members * 100) / 100,
    sugarKg: Math.round(schema.sugarKgPerMember * members * 100) / 100,
    familyMembersCount: members,
  };
};

const getQuotaForUser = async (user) => {
  const schema = await RationQuotaSchema.findOne({
    cardType: user.rationCardType,
    isActive: true,
  });
  if (!schema) {
    return null;
  }
  const allocated = calculateQuota(schema, user.familyMembersCount);
  return {
    month: getCurrentMonth(),
    cardType: user.rationCardType,
    schemaLabel: schema.label,
    allocated,
    schema: {
      riceKgPerMember: schema.riceKgPerMember,
      wheatKgPerMember: schema.wheatKgPerMember,
      sugarKgPerMember: schema.sugarKgPerMember,
    },
  };
};

const generateReceiptId = () => `RCP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

module.exports = {
  getCurrentMonth,
  calculateQuota,
  getQuotaForUser,
  generateReceiptId,
  generateOtp,
};
