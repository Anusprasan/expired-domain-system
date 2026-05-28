const Domain = require('../models/Domain');
const Brand = require('../models/Brand');
const SerpRun = require('../models/SerpRun');
const { DomainActivityLog } = require('../models/DomainActivityLog');
const { listBrands } = require('./systemBrandService');

const normalizeBrandKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const buildSystemBrandMap = (brands = []) => {
  const map = new Map();

  brands.forEach((brand) => {
    [brand.code, brand.name].forEach((value) => {
      const key = normalizeBrandKey(value);
      if (key) {
        map.set(key, brand);
      }
    });
  });

  return map;
};

const migrateCollection = async ({ model, legacyBrandId, targetBrandId }) => {
  const result = await model.updateMany(
    { brand: legacyBrandId },
    { $set: { brand: targetBrandId } }
  );

  return result.modifiedCount || 0;
};

const migrateLegacyBrandReferences = async () => {
  const [legacyBrands, systemBrands] = await Promise.all([
    Brand.find({}).select('_id code name').lean(),
    listBrands(),
  ]);

  if (!legacyBrands.length || !systemBrands.length) {
    return { migrated: false, updated: { domains: 0, runs: 0, logs: 0 } };
  }

  const systemBrandMap = buildSystemBrandMap(systemBrands);
  const updated = { domains: 0, runs: 0, logs: 0 };

  for (const legacyBrand of legacyBrands) {
    const targetBrand =
      systemBrandMap.get(normalizeBrandKey(legacyBrand.code)) ||
      systemBrandMap.get(normalizeBrandKey(legacyBrand.name));

    if (!targetBrand) {
      continue;
    }

    updated.domains += await migrateCollection({
      model: Domain,
      legacyBrandId: legacyBrand._id,
      targetBrandId: targetBrand._id,
    });
    updated.runs += await migrateCollection({
      model: SerpRun,
      legacyBrandId: legacyBrand._id,
      targetBrandId: targetBrand._id,
    });
    updated.logs += await migrateCollection({
      model: DomainActivityLog,
      legacyBrandId: legacyBrand._id,
      targetBrandId: targetBrand._id,
    });
  }

  return {
    migrated: updated.domains > 0 || updated.runs > 0 || updated.logs > 0,
    updated,
  };
};

module.exports = {
  migrateLegacyBrandReferences,
};
