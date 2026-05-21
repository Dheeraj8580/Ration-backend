const RationQuotaSchema = require('../models/RationQuotaSchema');

const DEFAULT_SCHEMAS = [
  {
    cardType: 'Antyodaya',
    label: 'Antyodaya Anna Yojana (AAY)',
    description: 'Poorest households — highest subsidy entitlements',
    riceKgPerMember: 35,
    wheatKgPerMember: 14,
    sugarKgPerMember: 1,
  },
  {
    cardType: 'BPL',
    label: 'Below Poverty Line (BPL)',
    description: 'Below poverty line households',
    riceKgPerMember: 25,
    wheatKgPerMember: 10,
    sugarKgPerMember: 0.5,
  },
  {
    cardType: 'APL',
    label: 'Above Poverty Line (APL)',
    description: 'Above poverty line households',
    riceKgPerMember: 15,
    wheatKgPerMember: 7,
    sugarKgPerMember: 0.5,
  },
];

const seedQuotaSchemas = async () => {
  for (const s of DEFAULT_SCHEMAS) {
    await RationQuotaSchema.findOneAndUpdate(
      { cardType: s.cardType },
      { $setOnInsert: s },
      { upsert: true, returnDocument: 'after' }
    );
  }
  console.log('✅ Government ration quota schemas ready (APL/BPL/Antyodaya)');
};

module.exports = seedQuotaSchemas;
