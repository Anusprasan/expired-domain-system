const mongoose = require('mongoose');
const env = require('../config/env');

const systemBrandSchema = new mongoose.Schema(
  {
    brandName: { type: String, required: true, trim: true, uppercase: true },
    backgroundCss: { type: String, default: '', trim: true },
    backgroundColor: { type: String, default: null, trim: true },
    gradientColors: { type: [String], default: [] },
    textColor: { type: String, default: '', trim: true },
  },
  {
    versionKey: false,
    collection: 'brands',
  }
);

let connectionPromise = null;

const normalizeId = (value) => String(value || '').trim();

const toPlain = (value) => {
  if (!value) return null;
  if (typeof value.toObject === 'function') {
    return value.toObject();
  }
  return { ...value };
};

const getBrandAccent = (brand) =>
  brand.backgroundColor || brand.gradientColors?.[0] || brand.textColor || '#64748b';

const toRankCheckerBrand = (brand) => ({
  _id: brand._id,
  code: brand.brandName,
  name: brand.brandName,
  color: getBrandAccent(brand),
  backgroundCss: brand.backgroundCss || '',
  textColor: brand.textColor || '#ffffff',
  isActive: true,
});

const getConnection = async () => {
  if (!connectionPromise) {
    const connection = mongoose.createConnection(env.mainAppMongoUri, {
      serverSelectionTimeoutMS: 5000,
    });

    connectionPromise = connection.asPromise();
  }

  return connectionPromise;
};

const getModel = async () => {
  const connection = await getConnection();
  return connection.models.SystemBrand || connection.model('SystemBrand', systemBrandSchema, 'brands');
};

const listBrands = async () => {
  const SystemBrand = await getModel();
  const brands = await SystemBrand.find({}).sort({ brandName: 1 }).lean();
  return brands.map(toRankCheckerBrand);
};

const findBrandById = async (brandId) => {
  const normalizedId = normalizeId(brandId);
  if (!normalizedId) {
    return null;
  }

  const SystemBrand = await getModel();
  const brand = await SystemBrand.findById(normalizedId).lean();
  return brand ? toRankCheckerBrand(brand) : null;
};

const findBrandsByIds = async (brandIds = []) => {
  const normalizedIds = [...new Set(brandIds.map(normalizeId).filter(Boolean))];
  if (!normalizedIds.length) {
    return new Map();
  }

  const SystemBrand = await getModel();
  const brands = await SystemBrand.find({ _id: { $in: normalizedIds } }).lean();

  return new Map(
    brands.map((brand) => {
      const normalizedBrand = toRankCheckerBrand(brand);
      return [normalizeId(normalizedBrand._id), normalizedBrand];
    })
  );
};

const attachBrands = async (rows = [], fieldName = 'brand') => {
  const brandIds = rows.map((row) => normalizeId(row?.[fieldName]?._id || row?.[fieldName]));
  const brandMap = await findBrandsByIds(brandIds);

  return rows.map((row) => {
    const plainRow = toPlain(row);
    const brandId = normalizeId(plainRow?.[fieldName]?._id || plainRow?.[fieldName]);
    return {
      ...plainRow,
      [fieldName]: brandMap.get(brandId) || null,
    };
  });
};

module.exports = {
  getSystemBrandConnection: getConnection,
  listBrands,
  findBrandById,
  findBrandsByIds,
  attachBrands,
  toRankCheckerBrand,
};
