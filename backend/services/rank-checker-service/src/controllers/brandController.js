const { findBrandById, listBrands } = require('../services/systemBrandService');

const getBrands = async (req, res, next) => {
  try {
    const brands = await listBrands();
    res.json(brands);
  } catch (error) {
    next(error);
  }
};

const getBrandById = async (req, res, next) => {
  try {
    const brand = await findBrandById(req.params.id);
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    return res.json(brand);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getBrands,
  getBrandById,
};
