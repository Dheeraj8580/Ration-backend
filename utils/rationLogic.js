const determineRationCardType = (annualIncome, familyMembersCount) => {
  const income = Number(annualIncome);
  const family = Number(familyMembersCount) || 1;

  if (income < 50000 || (income < 75000 && family >= 5)) return 'Antyodaya';
  if (income < 150000) return 'BPL';
  return 'APL';
};

const generateRationCardNumber = (state) => {
  const code = (state || 'IN').substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
  return `RAC-${code}-${Math.floor(100000 + Math.random() * 900000)}`;
};

module.exports = { determineRationCardType, generateRationCardNumber };
